import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { demoReport } from '../src/demo-data.js';
import { attachEvidenceContent, parseEvidenceBundle } from '../src/evidence.js';
import { normalizeReport, unwrapRocketRideResponse, validateReport } from '../src/report.js';
import { scenarioLibrary } from '../src/scenarios.js';

test('the bundled demo is a valid, explicitly non-live report', () => {
  assert.deepEqual(validateReport(demoReport), { ok: true, errors: [] });
  assert.equal(demoReport.mode, 'demo');
  assert.equal(demoReport.promises.length, 5);
  assert.ok(demoReport.proofs.length >= 3);
  assert.ok(demoReport.semanticMap.nodes.some(node => node.type === 'decision'));
});

test('normalization does not allow an imported demo to claim live provenance', () => {
  const normalized = normalizeReport({ ...demoReport, mode: 'demo' });
  assert.equal(normalized.mode, 'imported');
  assert.equal(normalized.recommendation.confidence, 84);
});

test('RocketRide answers can be unwrapped from JSON strings', () => {
  assert.deepEqual(unwrapRocketRideResponse({ answers: ['```json\n{"ok":true}\n```'] }), { ok: true });
});

test('RocketRide extract_data single-row tables are unwrapped', () => {
  assert.deepEqual(
    unwrapRocketRideResponse({ answers: ['[{"reportId":"signal_room_live"}]'] }),
    { reportId: 'signal_room_live' }
  );
  assert.throws(
    () => unwrapRocketRideResponse({ answers: ['[]'] }),
    /Expected one RocketRide report row/
  );
});

test('original evidence sections are preserved without including the task prompt', () => {
  const evidence = 'SOURCE: Call — Maya\nExact customer words.\n\nSOURCE: Metrics\nObserved result.\n\nTASK\nMake a decision.';
  assert.deepEqual(parseEvidenceBundle(evidence), [
    { name: 'Call — Maya', content: 'Exact customer words.', contentStatus: 'full' },
    { name: 'Metrics', content: 'Observed result.', contentStatus: 'full' }
  ]);
  const attached = attachEvidenceContent([{ id: '1', name: 'Call — Maya' }, { id: '2', name: 'Metrics' }], evidence);
  assert.equal(attached[0].content, 'Exact customer words.');
  assert.doesNotMatch(attached[1].content, /Make a decision/);
});

test('pipeline has real parallel specialists and no embedded credentials', async () => {
  const raw = await readFile(new URL('../pipelines/signal-room.pipe', import.meta.url), 'utf8');
  const pipeline = JSON.parse(raw);
  const providers = pipeline.components.map(component => component.provider);
  assert.equal(providers.filter(provider => provider === 'llm_openai').length, 5);
  assert.ok(providers.includes('answer_documents'));
  assert.ok(providers.includes('extract_data'));
  assert.match(raw, /\$\{ROCKETRIDE_OPENAI_KEY\}/);
  assert.doesNotMatch(raw, /sk-[A-Za-z0-9]/);
});

test('delivery review is a separate RocketRide workflow with bounded reviewer roles', async () => {
  const raw = await readFile(new URL('../pipelines/delivery-review.pipe', import.meta.url), 'utf8');
  const pipeline = JSON.parse(raw);
  const names = pipeline.components.map(component => component.name);
  const providers = pipeline.components.map(component => component.provider);
  assert.ok(names.includes('Change reviewer'));
  assert.ok(names.includes('Quality gatekeeper'));
  assert.ok(names.includes('Release skeptic'));
  assert.ok(providers.includes('extract_data'));
  assert.match(raw, /never automatic release/i);
  assert.match(raw, /\$\{ROCKETRIDE_OPENAI_KEY\}/);
  assert.doesNotMatch(raw, /sk-[A-Za-z0-9]/);
});

test('the local UI exposes an honest guided tour and saved-live-run loader', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(html, /id="tourButton"/);
  assert.match(html, /id="factoryIdeaInput"/);
  assert.match(html, /id="factoryGenerateButton"/);
  assert.match(html, /id="scenarioList"/);
  assert.match(html, /id="reviewWorkspace"/);
  assert.match(html, /id="loadLiveButton" hidden/);
  assert.match(html, /id="liveAnalyzeButton"/);
  assert.match(html, /id="proofPanel"/);
  assert.match(html, /id="sourceDialog"/);
  assert.match(html, /id="engineStatus"/);
  assert.match(app, /The browser loaded its saved result/);
  assert.match(app, /renderScenarios/);
  assert.match(app, /analyzeSelectedScenario/);
  assert.match(app, /runLiveAnalysis/);
  assert.match(app, /renderProofs/);
  assert.match(app, /Absence means "not checked," never "healthy/);
  assert.match(app, /get\('tour'\) === '1'/);
  assert.match(app, /never calls a model/);
});

test('all seeded scenarios are valid and have traceable evidence', () => {
  assert.equal(scenarioLibrary.length, 3);
  for (const scenario of scenarioLibrary) {
    const result = validateReport(scenario.report);
    assert.deepEqual(result, { ok: true, errors: [] }, scenario.id);
    assert.match(scenario.evidenceText, /^SOURCE:/);
    assert.equal(scenario.report.recommendation.title, scenario.expectedTitle);
    const normalized = normalizeReport(scenario.report);
    for (const proof of normalized.proofs) {
      const source = normalized.sources.find(item => item.id === proof.sourceId || item.name === proof.sourceName);
      assert.ok(source, `${scenario.id} has a proof without a source`);
      assert.ok(source.content.includes(proof.quote), `${scenario.id} proof quote must be in source text`);
    }
  }
});

test('proof claims are rejected when they cite missing sources', () => {
  const result = validateReport({
    ...demoReport,
    proofs: [{ id: 'bad', claim: 'Unsupported claim', sourceId: 'missing', agent: 'Synthesis', status: 'supported', quote: 'Nope.' }]
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /unknown source id/);
});
