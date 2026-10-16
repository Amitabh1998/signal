import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { RocketRideClient } from 'rocketride';
import { validateReport } from '../src/report.js';

async function loadDotEnv(filepath) {
  try {
    const contents = await readFile(filepath, 'utf8');
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match) continue;
      const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
      if (process.env[match[1]] === undefined) process.env[match[1]] = value;
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

await loadDotEnv(resolve('.env'));
const uri = process.env.ROCKETRIDE_URI || 'ws://localhost:5565';
const auth = process.env.ROCKETRIDE_AUTH || process.env.ROCKETRIDE_APIKEY || '';
const pipelinePaths = [resolve('pipelines/evidence-parse.pipe'), resolve('pipelines/signal-room.pipe'), resolve('pipelines/delivery-review.pipe')];
const healthPath = resolve('data/rocketride-health.json');
const pipelines = await Promise.all(pipelinePaths.map(async filepath => ({ filepath, pipeline: JSON.parse(await readFile(filepath, 'utf8')) })));
const client = new RocketRideClient({
  uri,
  auth: auth || undefined,
  persist: false,
  requestTimeout: 60_000,
  clientName: 'Signal Room health check',
  clientVersion: '0.1.0'
});

try {
  const started = performance.now();
  await client.connect();
  await client.ping();
  const latencyMs = Math.round(performance.now() - started);
  const validations = await Promise.all(pipelines.map(({ pipeline }) => client.validate({ pipeline })));
  const errors = validations.reduce((count, validation) => count + validation.errors.length, 0);
  const warnings = validations.reduce((count, validation) => count + validation.warnings.length, 0);
  if (errors) throw new Error(`Pipeline validation returned ${errors} error(s).`);

  let lastReport;
  try {
    const report = JSON.parse(await readFile(resolve('data/live-report.json'), 'utf8'));
    const result = validateReport(report);
    lastReport = {
      valid: result.ok,
      generatedAt: report.generatedAt,
      reportId: report.reportId,
      taskTokenPrefix: report.provenance?.taskTokenPrefix,
      sources: report.sources?.length || 0,
      sourcesWithContent: report.sources?.filter(source => source.content).length || 0
    };
  } catch {
    lastReport = { valid: false };
  }

  const health = {
    schemaVersion: 1,
    ok: true,
    checkedAt: new Date().toISOString(),
    engineUri: uri,
    latencyMs,
    pipeline: pipelines.map(({ filepath }) => filepath.split('/').at(-1)).join(' + '),
    pipelines: pipelines.map(({ filepath }) => filepath.split('/').at(-1)),
    validation: { errors: 0, warnings },
    lastReport
  };
  await writeFile(healthPath, `${JSON.stringify(health, null, 2)}\n`, 'utf8');
  console.log('RocketRide health: PASS');
  console.log(`Engine: reachable and authenticated at ${uri} (${latencyMs} ms)`);
  console.log(`Pipelines: all valid (${warnings} warning(s))`);
  console.log(`Last report: ${lastReport.valid ? 'valid' : 'not available or invalid'}`);
} catch (error) {
  const health = {
    schemaVersion: 1,
    ok: false,
    checkedAt: new Date().toISOString(),
    engineUri: uri,
    pipeline: pipelinePaths.map(filepath => filepath.split('/').at(-1)).join(' + '),
    message: 'Connection, authentication, or pipeline validation failed. Run npm run rocketride:check in the terminal for details.'
  };
  await writeFile(healthPath, `${JSON.stringify(health, null, 2)}\n`, 'utf8');
  console.error('RocketRide health: FAIL');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  try { await client.disconnect(); } catch { /* Health result is already known. */ }
}
