import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { demoReport } from '../src/demo-data.js';
import { attachEvidenceContent, parseEvidenceBundle } from '../src/evidence.js';
import { verifyReportProofs } from '../src/proof-verification.js';
import { normalizeReport, unwrapRocketRideResponse, validateReport } from '../src/report.js';
import { scenarioLibrary } from '../src/scenarios.js';
import { acceptUploads } from '../scripts/evidence-ingestion.mjs';

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

test('RocketRide extract_data item wrappers are unwrapped', () => {
  assert.deepEqual(unwrapRocketRideResponse({ answers: [{ items: [{ verdict: 'ready' }] }] }), { verdict: 'ready' });
});

test('RocketRide extract_data split rows keep the most complete row', () => {
  assert.deepEqual(
    unwrapRocketRideResponse({ answers: ['[{"verdict":"needs-review"},{"verdict":"needs-review","summary":"Full review","checks":[]}]'] }),
    { verdict: 'needs-review', summary: 'Full review', checks: [] }
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
  assert.equal(providers.filter(provider => provider === 'llm_openai_api').length, 6);
  assert.ok(pipeline.components.some(component => component.name === 'Independent promise judge'));
  assert.match(raw, /Copy promise assessments from the independent Promise Judge/);
  assert.ok(providers.includes('answer_documents'));
  assert.ok(providers.includes('extract_data'));
  assert.match(raw, /https:\/\/openrouter\.ai\/api\/v1/);
  assert.match(raw, /\$\{ROCKETRIDE_OPENROUTER_KEY\}/);
  assert.match(raw, /openai\/gpt-4o-mini/);
  assert.match(raw, /openai\/gpt-4o/);
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
  assert.equal(providers.filter(provider => provider === 'llm_openai_api').length, 6);
  // The diff is read by an agent through git tools that cannot write.
  const agent = pipeline.components.find(component => component.provider === 'agent_rocketride');
  const git = pipeline.components.find(component => component.provider === 'tool_git');
  assert.ok(agent?.config.require_tool_call);
  assert.equal(git.config.readOnlyMode, true);
  assert.deepEqual(git.control, [{ classType: 'tool', from: agent.id }]);
  assert.ok(pipeline.components.some(component => component.provider === 'memory_internal' && component.control?.[0]?.from === agent.id));
  assert.match(raw, /never automatic release/i);
  assert.match(raw, /https:\/\/openrouter\.ai\/api\/v1/);
  assert.match(raw, /\$\{ROCKETRIDE_OPENROUTER_KEY\}/);
  assert.doesNotMatch(raw, /sk-[A-Za-z0-9]/);
});

test('execution ships a real tested patch instead of a simulated delivery summary', async () => {
  const execution = await readFile(new URL('../scripts/signal-execute.mjs', import.meta.url), 'utf8');
  assert.match(execution, /commitRange: \{ base: baseCommit, head \}/);
  assert.match(execution, /repoPath: worktree/);
  // The reviewed commit reaches the remote only after the delivery review.
  const review = execution.indexOf('scripts/rocketride-delivery-review.mjs');
  assert.ok(review > 0 && review < execution.indexOf("run('git', ['push'"));
  assert.match(execution, /qualityGates\.push\(\{ name: 'npm test', status: 'passed', output:/);
  assert.match(execution, /qualityGates\.push\(\{ name: 'npm run build', status: 'passed', output:/);
  assert.match(execution, /run\('codex', \['exec', '-C', worktree, '-s', 'workspace-write', '--ephemeral'/);
  assert.match(execution, /'--permission-mode', 'acceptEdits'/);
  assert.match(execution, /SIGNAL_EXECUTION_PR_MODE/);
  assert.doesNotMatch(execution, /'-a', 'never'/);
});

test('the local UI exposes an honest guided tour and saved-live-run loader', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(html, /id="tourButton"/);
  assert.match(html, /id="factoryIdeaInput"/);
  assert.match(html, /class="file-input" id="fileInput" type="file"/);
  assert.match(html, /id="attachmentList" aria-live="polite" hidden/);
  assert.match(html, /Context included in this scope run/);
  assert.match(html, /id="scopeRunNotice" aria-live="polite" hidden/);
  assert.match(html, /id="factoryGenerateButton"/);
  assert.match(html, /Run scope workflow/);
  assert.match(html, /id="requestValidation"/);
  assert.match(html, /id="scenarioList"/);
  assert.match(html, /id="reviewWorkspace"/);
  assert.match(html, /id="loadLiveButton" hidden/);
  assert.match(html, /id="openLatestLiveButton" type="button" hidden/);
  assert.match(html, /id="liveAnalyzeButton"/);
  assert.match(html, /id="proofPanel"/);
  assert.match(html, /id="sourceDialog"/);
  assert.match(html, /id="engineStatus"/);
  assert.match(html, /id="connectionsButton"/);
  assert.match(html, /id="connectionsDialog"/);
  assert.match(html, /Open implementation decision/);
  assert.match(html, /Choose files/);
  assert.match(app, /Live scope report/);
  assert.match(app, /Text, Markdown, JSON, JSONL, CSV, and XLSX are supported/);
  assert.match(html, /\.xlsx/);
  assert.match(app, /Before build: define the categories/);
  assert.match(app, /renderScenarios/);
  assert.match(app, /analyzeSelectedScenario/);
  assert.match(app, /runLiveAnalysis/);
  assert.match(app, /renderProofs/);
  assert.match(app, /Absence means "not checked," never "healthy/);
  assert.match(app, /get\('tour'\) === '1'/);
  assert.match(app, /never calls a model/);
  assert.match(app, /refreshConnections/);
  assert.match(app, /\$\('#openLatestLiveButton'\)\.hidden = false/);
  assert.match(app, /No scope, requirements, risks, or technical plan has been generated yet/);
  assert.match(app, /scopeReportReady = report.mode === 'live'/);
  assert.doesNotMatch(app, /generateFactoryBlueprint/);
  assert.match(app, /allStagedSources/);
  assert.match(app, /renderAttachmentList/);
  assert.match(app, /handleFileSelection/);
  assert.match(app, /syncScopeAction/);
  assert.match(app, /setScopeRunNotice/);
  assert.match(app, /RocketRide is offline on this Mac/);
  assert.match(app, /acceptanceCriteria/);
  assert.match(app, /scope-workflow-running/);
  const server = await readFile(new URL('../scripts/serve.mjs', import.meta.url), 'utf8');
  assert.match(server, /scopeWorkflowRunning/);
  assert.match(server, /scope-workflow-running/);
  assert.doesNotMatch(app, /\$\('\.momentum-score strong'\)/);
});

test('binary XLSX uploads are fingerprinted and passed to RocketRide unparsed', async () => {
  const bytes = await readFile(new URL('../data/source-packs/security-center-q4/05-enterprise-pipeline.xlsx', import.meta.url));
  const [upload] = acceptUploads([{ name: 'enterprise-pipeline.xlsx', dataBase64: bytes.toString('base64') }]);
  assert.equal(upload.kind, 'SHEET');
  assert.equal(upload.mimeType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.ok(upload.buffer.equals(bytes));
  assert.match(upload.sha256, /^[a-f0-9]{64}$/);
  assert.throws(() => acceptUploads([{ name: 'notes.exe', dataBase64: 'AA==' }]), /not supported/);
});

test('proof verification distinguishes exact quotes from unsupported text', () => {
  const report = verifyReportProofs({
    sources: [{ id: 'source-1', name: 'Call', content: 'The exact customer quote is here.' }],
    proofs: [
      { sourceId: 'source-1', quote: 'exact customer quote' },
      { sourceId: 'source-1', quote: 'Paraphrase: the customer quote is exact' },
      { sourceId: 'source-1', quote: 'Invented words' }
    ]
  });
  assert.deepEqual(report.proofs.map(proof => proof.verification.status), ['verbatim', 'paraphrase', 'not-found']);
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
