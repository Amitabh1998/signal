import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { RocketRideClient } from 'rocketride';
import { unwrapRocketRideResponse } from '../src/report.js';

async function loadDotEnv(filepath) {
  try {
    const contents = await readFile(filepath, 'utf8');
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
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

function text(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeDeliveryReview(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error('RocketRide delivery review must be one JSON object.');
  const verdict = ['ready', 'needs-review', 'blocked'].includes(candidate.verdict) ? candidate.verdict : 'needs-review';
  return {
    schemaVersion: 1,
    mode: 'live',
    reviewId: text(candidate.reviewId, `signal_delivery_${Date.now()}`),
    generatedAt: text(candidate.generatedAt, new Date().toISOString()),
    verdict,
    summary: text(candidate.summary, 'RocketRide returned no delivery summary.'),
    checks: Array.isArray(candidate.checks) ? candidate.checks.slice(0, 12).map((check, index) => ({
      name: text(check?.name, `Check ${index + 1}`),
      status: ['passed', 'failed', 'missing', 'review'].includes(check?.status) ? check.status : 'review',
      detail: text(check?.detail, 'No detail returned.'),
      evidence: text(check?.evidence, 'No recorded evidence.')
    })) : [],
    risks: Array.isArray(candidate.risks) ? candidate.risks.slice(0, 12).map((risk, index) => ({
      title: text(risk?.title, `Risk ${index + 1}`),
      severity: ['low', 'medium', 'high'].includes(risk?.severity) ? risk.severity : 'medium',
      detail: text(risk?.detail, 'No detail returned.'),
      evidence: text(risk?.evidence, 'No recorded evidence.')
    })) : [],
    promises: Array.isArray(candidate.promises) ? candidate.promises.slice(0, 6).map((promise, index) => ({
      agent: text(promise?.agent, `Reviewer ${index + 1}`),
      body: text(promise?.body, 'Bounded delivery assessment.'),
      assessment: ['kept', 'qualified', 'broken'].includes(promise?.assessment) ? promise.assessment : 'qualified'
    })) : [],
    trace: Array.isArray(candidate.trace) ? candidate.trace.slice(0, 24).map(link => ({
      from: text(link?.from, 'delivery bundle'),
      to: text(link?.to, 'review'),
      kind: link?.kind === 'challenges' ? 'challenges' : 'supports'
    })) : []
  };
}

const args = parseArgs(process.argv.slice(2));
await loadDotEnv(resolve('.env'));
const inputPath = resolve(String(args.input || ''));
const outputPath = resolve(String(args.output || 'data/live-delivery-review.json'));
const pipelinePath = resolve(String(args.pipeline || 'pipelines/delivery-review.pipe'));
const uri = String(args.uri || process.env.ROCKETRIDE_URI || 'ws://localhost:5565');
const auth = String(args.auth || process.env.ROCKETRIDE_AUTH || process.env.ROCKETRIDE_APIKEY || '');
if (!inputPath) throw new Error('A delivery evidence input is required.');

const deliveryBundle = JSON.parse(await readFile(inputPath, 'utf8'));
const client = new RocketRideClient({ uri, auth: auth || undefined, persist: false, requestTimeout: 180_000, clientName: 'Signal delivery review', clientVersion: '0.1.0' });
let token;
try {
  console.log(`Connecting to RocketRide at ${uri}…`);
  await client.connect();
  const run = await client.use({ filepath: pipelinePath, pipelineTraceLevel: 'summary', name: 'Signal delivery review' });
  token = run.token;
  const rawResult = await client.send(token, JSON.stringify(deliveryBundle, null, 2), { name: inputPath.split('/').at(-1), signalDeliveryReview: true }, 'application/json');
  if (!rawResult) throw new Error('RocketRide returned no delivery review.');
  const review = normalizeDeliveryReview(unwrapRocketRideResponse(rawResult));
  review.provenance = { engineUri: uri, pipeline: pipelinePath.split('/').at(-1), pipelineTraceLevel: 'summary', taskTokenPrefix: token.slice(0, 10), importedFrom: inputPath.split('/').at(-1) };
  await writeFile(outputPath, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
  console.log(`Live RocketRide delivery review written to ${outputPath}`);
} finally {
  if (token) {
    try { await client.terminate(token); } catch { /* A completed task may already be gone. */ }
  }
  try { await client.disconnect(); } catch { /* Never hide the original delivery failure. */ }
}
