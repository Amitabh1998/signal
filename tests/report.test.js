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

test('model-named sources are matched to the file they came from, never by position', () => {
  const evidence = [
    'SOURCE: 04-support-tickets.jsonl\n{"id":"TCK-1845","evidence":"Security committee asked for retention."}',
    'SOURCE: 01-customer-call-nadia-finlytics.md\nThe issue is whether I can approve broader rollout.',
    'SOURCE: 05-enterprise-pipeline.xlsx\nOPP-901\tFinlytics'
  ].join('\n\n');
  const attached = attachEvidenceContent([
    { id: 'TCK-1845', name: 'HelioBank Security Ticket' },
    { id: '01-customer-call-nadia-finlytics.md', name: 'Customer Call Transcript: Nadia' },
    { id: 'pipeline', name: 'Enterprise Pipeline' },
    { id: 'unknown', name: 'Board deck' }
  ], evidence);
  assert.match(attached[0].content, /TCK-1845/);
  assert.match(attached[1].content, /approve broader rollout/);
  assert.match(attached[2].content, /OPP-901/);
  assert.deepEqual([attached[3].content, attached[3].contentStatus], ['', 'metadata']);
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

// Behaviour (setup, gates, push, PR, failure, timeout, cancel) is covered in executor.test.js.
test('execution reviews the committed patch before anything is pushed', async () => {
  const execution = await readFile(new URL('../scripts/signal-execute.mjs', import.meta.url), 'utf8');
  assert.match(execution, /commitRange: \{ base: baseCommit, head \}/);
  assert.match(execution, /repoPath: worktree/);
  const review = execution.indexOf('scripts/rocketride-delivery-review.mjs');
  assert.ok(review > 0 && review < execution.indexOf("await git(worktree, 'push'"));
  assert.match(execution, /'--permission-mode', 'acceptEdits'/);
  assert.match(execution, /'--strict-mcp-config'/);
  assert.match(execution, /'--max-budget-usd', String\(agentBudget\)/);
  assert.match(execution, /exec\('codex', \['exec', '-C', worktree, '-s', 'workspace-write', '--ephemeral'/);
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
  assert.match(app, /fetch\('\/api\/health'/);
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
  assert.match(app, /'engine-offline': 'RocketRide is not reachable/);
  assert.match(app, /acceptanceCriteria/);
  // A second click attaches to the active run instead of starting another.
  assert.match(app, /payload\.code === 'run-active'/);
  const server = await readFile(new URL('../scripts/serve.mjs', import.meta.url), 'utf8');
  assert.match(server, /runs\.startScope/);
  assert.match(server, /allowedHosts\.has/);
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
