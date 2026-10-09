import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { RocketRideClient } from 'rocketride';
import { attachEvidenceContent } from '../src/evidence.js';
import { normalizeReport, unwrapRocketRideResponse } from '../src/report.js';

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

const args = parseArgs(process.argv.slice(2));
await loadDotEnv(resolve('.env'));
const inputPath = resolve(String(args.input || 'data/sample-evidence.txt'));
const outputPath = resolve(String(args.output || 'data/live-report.json'));
const pipelinePath = resolve(String(args.pipeline || 'pipelines/signal-room.pipe'));
const uri = String(args.uri || process.env.ROCKETRIDE_URI || 'ws://localhost:5565');
const auth = String(args.auth || process.env.ROCKETRIDE_AUTH || process.env.ROCKETRIDE_APIKEY || '');

if (args.help) {
  console.log('Usage: npm run analyze:live -- --input evidence.txt [--output report.json] [--uri ws://localhost:5565]');
  process.exit(0);
}

const evidence = await readFile(inputPath, 'utf8');
if (!evidence.trim()) throw new Error(`Input file is empty: ${inputPath}`);

const client = new RocketRideClient({
  uri,
  auth: auth || undefined,
  persist: false,
  requestTimeout: 180_000,
  clientName: 'Signal Room',
  clientVersion: '0.1.0'
});

let token;
try {
  console.log(`Connecting to RocketRide at ${uri}…`);
  await client.connect();
  const run = await client.use({
    filepath: pipelinePath,
    pipelineTraceLevel: 'summary',
    name: 'Signal Room evidence analysis'
  });
  token = run.token;
  console.log(`Pipeline started: ${token.slice(0, 10)}…`);

  const rawResult = await client.send(
    token,
    evidence,
    { name: inputPath.split('/').at(-1), signalRoom: true },
    'text/plain'
  );
  if (!rawResult) throw new Error('RocketRide returned no pipeline result.');

  const unwrapped = unwrapRocketRideResponse(rawResult);
  const report = normalizeReport({ ...unwrapped, mode: 'live' });
  report.sources = attachEvidenceContent(report.sources, evidence);
  report.mode = 'live';
  report.generatedAt = new Date().toISOString();
  report.reportId = `${report.reportId}_${Date.now()}`;
  report.provenance = {
    engineUri: uri,
    pipeline: pipelinePath.split('/').at(-1),
    pipelineTraceLevel: 'summary',
    taskTokenPrefix: token.slice(0, 10),
    importedFrom: inputPath.split('/').at(-1)
  };

  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Live RocketRide report written to ${outputPath}`);
  console.log('Import that JSON from the Signal Room UI.');
} catch (error) {
  console.error('\nNo report was generated. Signal Room will not substitute demo output for a failed live run.');
  console.error(`RocketRide error: ${error instanceof Error ? error.message : String(error)}`);
  console.error('Check that the engine is reachable and that ROCKETRIDE_OPENAI_KEY is available to the engine.');
  process.exitCode = 1;
} finally {
  if (token) {
    try { await client.terminate(token); } catch { /* The run may already be gone. */ }
  }
  try { await client.disconnect(); } catch { /* Never mask the original error. */ }
}
