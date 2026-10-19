import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { RocketRideClient } from 'rocketride';
import { attachEvidenceContent } from '../src/evidence.js';
import { verifyReportProofs } from '../src/proof-verification.js';
import { normalizeReport, unwrapRocketRideResponse } from '../src/report.js';
import { createFlowRecorder, scopeFlowSteps } from '../src/rocketride-flow.js';
import { applyJudgeVerdicts } from '../src/promise-judge.js';

async function loadDotEnv(filepath) {
  try {
    const contents = await readFile(filepath, 'utf8');
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      const value = rawValue.replace(/^(['"])(.*)\1$/, '$2');
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];
    if (part.startsWith('--')) args[part.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[++index] : true;
  }
  return args;
}

const parseFlowSteps = [{ label: 'Parse evidence', kind: 'step', components: ['file_in', 'parse_file', 'parsed_text', 'parsed_table'] }];
const mimeByExtension = {
  txt: 'text/plain', md: 'text/markdown', markdown: 'text/markdown', json: 'application/json',
  jsonl: 'application/x-ndjson', csv: 'text/csv', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

const args = parseArgs(process.argv.slice(2));
await loadDotEnv(resolve('.env'));
const outputPath = resolve(String(args.output || 'data/live-report.json'));
const pipelinePath = resolve(String(args.pipeline || 'pipelines/signal-room.pipe'));
const parsePipelinePath = resolve('pipelines/evidence-parse.pipe');
const uri = String(args.uri || process.env.ROCKETRIDE_URI || 'ws://localhost:5565');
const auth = String(args.auth || process.env.ROCKETRIDE_AUTH || process.env.ROCKETRIDE_APIKEY || '');

if (args.help) {
  console.log('Usage: npm run analyze:live -- --input evidence.(txt|md|jsonl|csv|xlsx) [--brief brief.txt] [--output report.json]');
  console.log('       (the server passes --files manifest.json with several files)');
  process.exit(0);
}

// Each entry: { name, path, mimeType, kind, size, sha256 }. RocketRide parses the raw bytes.
const files = args.files
  ? JSON.parse(await readFile(resolve(String(args.files)), 'utf8'))
  : [resolve(String(args.input || 'data/sample-evidence.txt'))].map(path => {
    const name = path.split('/').at(-1);
    const ext = name.split('.').at(-1).toLowerCase();
    return { name, path, mimeType: mimeByExtension[ext] || 'text/plain', kind: ext === 'xlsx' ? 'SHEET' : ext.toUpperCase() };
  });
const brief = args.brief ? (await readFile(resolve(String(args.brief)), 'utf8')).trim() : '';
if (!files.length) throw new Error('At least one evidence file is required.');

const parseFlow = createFlowRecorder(parseFlowSteps);
const flow = createFlowRecorder(scopeFlowSteps, { capture: ['promise_judge_document'] });
let activeFlow = parseFlow;
// Stream the first time each step starts so the server can show live progress.
const stepByComponent = new Map([...parseFlowSteps, ...scopeFlowSteps].flatMap(step => (step.work || step.components).map(component => [component, step.label])));
const startedSteps = new Set();
function reportProgress(message) {
  const body = message?.event === 'apaevt_flow' ? message.body : null;
  const step = body?.op === 'enter' && !['open', 'close', 'closing'].includes(body.trace?.lane) && stepByComponent.get(body.component);
  if (!step || startedSteps.has(step)) return;
  startedSteps.add(step);
  process.stdout.write(`${JSON.stringify({ type: 'signal-flow', step, at: Date.now() })}\n`);
}
const client = new RocketRideClient({
  uri,
  auth: auth || undefined,
  persist: false,
  requestTimeout: 180_000,
  clientName: 'Signal Room',
  clientVersion: '0.1.0',
  onEvent: async message => {
    activeFlow.onEvent(message);
    reportProgress(message);
  }
});

const firstText = value => (Array.isArray(value) ? value : [value]).filter(item => typeof item === 'string').join('\n').trim();
const tablesOf = value => (Array.isArray(value) ? value : []).filter(item => typeof item === 'string' && item.trim());

// Combine the parse stage and the scope workflow into one engine timeline.
function engineTrace(parseSummary, scopeSummary) {
  const offset = parseSummary.durationMs;
  return {
    trace: [
      ...parseSummary.steps,
      ...scopeSummary.steps.filter(step => step.label !== 'Parse evidence').map(step => ({ ...step, startMs: step.startMs + offset }))
    ],
    flowEventCount: parseSummary.eventCount + scopeSummary.eventCount,
    engineDurationMs: offset + scopeSummary.durationMs
  };
}

const tokens = [];
// Cancel and shutdown arrive as SIGTERM. Terminate this run's engine tasks
// first, or RocketRide keeps executing an abandoned pipeline.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, async () => {
    await Promise.race([
      Promise.all(tokens.map(token => client.terminate(token).catch(() => {}))),
      new Promise(resolveWait => setTimeout(resolveWait, 3000))
    ]);
    try { await client.disconnect(); } catch { /* Exiting anyway. */ }
    process.exit(130);
  });
}
try {
  console.log(`Connecting to RocketRide at ${uri}…`);
  await client.connect();

  // Stage 1: RocketRide's parse node reads every file from its raw bytes.
  const parseRun = await client.use({ filepath: parsePipelinePath, pipelineTraceLevel: 'summary', name: 'Signal evidence parse' });
  tokens.push(parseRun.token);
  await client.addMonitor({ token: parseRun.token }, ['flow']);
  const parsedEvidence = [];
  for (const file of files) {
    const bytes = new Uint8Array(await readFile(file.path));
    const result = await client.send(parseRun.token, bytes, { name: file.name }, file.mimeType);
    const text = firstText(result?.text);
    if (!text) throw new Error(`RocketRide's parse node returned no text for ${file.name}.`);
    parsedEvidence.push({ name: file.name, kind: file.kind, mimeType: file.mimeType, size: file.size ?? bytes.length, sha256: file.sha256, characters: text.length, tables: tablesOf(result?.table).slice(0, 4).map(table => table.slice(0, 20_000)), text });
    console.log(`RocketRide parsed ${file.name}: ${text.length} characters${tablesOf(result?.table).length ? `, ${tablesOf(result.table).length} table(s)` : ''}`);
  }
  const evidence = [...parsedEvidence.map(item => `SOURCE: ${item.name}\n${item.text}`), ...(brief ? [`TASK\n${brief}`] : [])].join('\n\n');

  // Stage 2: the scope workflow reads all parsed sources in one turn.
  activeFlow = flow;
  const run = await client.use({ filepath: pipelinePath, pipelineTraceLevel: 'full', name: 'Signal Room evidence analysis' });
  tokens.push(run.token);
  console.log(`Pipeline started: ${run.token.slice(0, 10)}…`);
  // Flow events are the engine's own record of which components ran and when.
  await client.addMonitor({ token: run.token }, ['flow']);
  const rawResult = await client.send(run.token, evidence, { name: 'evidence-bundle.txt', signalRoom: true }, 'text/plain');
  if (!rawResult) throw new Error('RocketRide returned no pipeline result.');

  const unwrapped = unwrapRocketRideResponse(rawResult);
  let report = normalizeReport({ ...unwrapped, mode: 'live' });
  report.sources = attachEvidenceContent(report.sources, evidence);
  report = verifyReportProofs(report);
  // The ledger shows the independent judge's grades, read from the engine's own events.
  report = applyJudgeVerdicts(report, flow.captured.promise_judge_document);
  report.mode = 'live';
  report.generatedAt = new Date().toISOString();
  report.reportId = `${report.reportId}_${Date.now()}`;
  report.parsedEvidence = parsedEvidence.map(({ text, ...item }) => item);
  report.provenance = {
    engineUri: uri,
    pipeline: pipelinePath.split('/').at(-1),
    parsePipeline: parsePipelinePath.split('/').at(-1),
    pipelineTraceLevel: 'full',
    taskTokenPrefix: run.token.slice(0, 10),
    importedFrom: files.map(file => file.name).join(', '),
    ...engineTrace(parseFlow.summarize(), flow.summarize())
  };

  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Live RocketRide report written to ${outputPath}`);
  console.log('Import that JSON from the Signal Room UI.');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  // A typed error line lets the server report the failure without parsing prose.
  const code = /failed to connect|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|socket hang up|websocket/i.test(message) ? 'engine-offline' : 'workflow-failed';
  process.stdout.write(`${JSON.stringify({ type: 'signal-error', code, message: message.slice(0, 2000) })}\n`);
  console.error('\nNo report was generated. Signal Room will not substitute demo output for a failed live run.');
  console.error(`RocketRide error: ${message}`);
  console.error('Check that the engine is reachable and that ROCKETRIDE_OPENROUTER_KEY is available to the engine.');
  process.exitCode = 1;
} finally {
  for (const token of tokens) {
    try { await client.terminate(token); } catch { /* The run may already be gone. */ }
  }
  try { await client.disconnect(); } catch { /* Never mask the original error. */ }
}
