import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { RocketRideClient } from 'rocketride';
import { unwrapRocketRideResponse } from '../src/report.js';
import { createFlowRecorder, deliveryFlowSteps } from '../src/rocketride-flow.js';
import { numberDiff, verifyCitations } from '../src/diff-citations.js';

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

function normalizeDeliveryReview(candidate, diffLines = new Set()) {
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
      evidence: text(check?.evidence, 'No recorded evidence.'),
      ...verifyCitations(check?.evidence, diffLines)
    })) : [],
    risks: Array.isArray(candidate.risks) ? candidate.risks.slice(0, 12).map((risk, index) => ({
      title: text(risk?.title, `Risk ${index + 1}`),
      severity: ['low', 'medium', 'high'].includes(risk?.severity) ? risk.severity : 'medium',
      detail: text(risk?.detail, 'No detail returned.'),
      evidence: text(risk?.evidence, 'No recorded evidence.'),
      ...verifyCitations(risk?.evidence, diffLines)
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

function engineTrace({ eventCount, durationMs, steps }) {
  return { trace: steps, flowEventCount: eventCount, engineDurationMs: durationMs };
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
const { repoPath, commitRange } = deliveryBundle;
if (!repoPath || !commitRange?.base || !commitRange?.head) throw new Error('The delivery bundle needs repoPath and commitRange { base, head }.');
const git = (...gitArgs) => execFileSync('git', ['-C', repoPath, ...gitArgs], { encoding: 'utf8', maxBuffer: 20_000_000 });
// Signal's own reading of the same commit: line-numbered for citations, and
// the stats the agent's read-only git.diff result must match.
const patch = git('diff', '--no-ext-diff', '--unified=40', commitRange.base, commitRange.head);
const { numbered, lines: diffLines } = numberDiff(patch);
const [, filesChanged = '0', insertions = '0', deletions = '0'] = git('diff', '--shortstat', commitRange.base, commitRange.head)
  .match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/) || [];
const commitStats = { filesChanged: Number(filesChanged), insertions: Number(insertions), deletions: Number(deletions) };

// The pipeline's tool_git node is bound to this commit's worktree, read-only.
const pipeline = JSON.parse(await readFile(pipelinePath, 'utf8'));
const gitNode = pipeline.components.find(component => component.provider === 'tool_git');
if (!gitNode) throw new Error(`${pipelinePath} has no tool_git node.`);
gitNode.config = { ...gitNode.config, repoPath, readOnlyMode: true, safeMode: true };

const flow = createFlowRecorder(deliveryFlowSteps, { capture: ['diff_document'], toolNodes: [gitNode.id] });
const client = new RocketRideClient({ uri, auth: auth || undefined, persist: false, requestTimeout: 300_000, clientName: 'Signal delivery review', clientVersion: '0.1.0', onEvent: async message => flow.onEvent(message) });
const short = sha => String(sha).slice(0, 7);

function agentEvidence() {
  const calls = flow.toolCalls.map(call => {
    if (call.tool === 'diff') {
      const output = call.output || {};
      return { tool: 'diff', refA: call.input.ref_a, refB: call.input.ref_b, filesChanged: output.files_changed, insertions: output.insertions, deletions: output.deletions };
    }
    if (call.tool === 'log') {
      const [entry] = Array.isArray(call.output) ? call.output : [];
      return { tool: 'log', sha: entry?.sha, subject: entry?.message };
    }
    return { tool: call.tool, input: call.input };
  });
  const diff = calls.find(call => call.tool === 'diff');
  const log = calls.find(call => call.tool === 'log');
  const readTheCommit = Boolean(diff)
    && String(diff.refA || '').startsWith(short(commitRange.base))
    && String(diff.refB || '').startsWith(short(commitRange.head));
  return {
    node: 'agent_rocketride',
    tool: 'tool_git',
    readOnly: true,
    calls,
    commit: { sha: commitRange.head, short: short(commitRange.head), subject: log?.subject || '' },
    stats: diff ? { filesChanged: diff.filesChanged, insertions: diff.insertions, deletions: diff.deletions } : null,
    commitStats,
    // True only when the agent's own git.diff targeted this commit and returned its exact stats.
    matchesCommit: readTheCommit && diff.filesChanged === commitStats.filesChanged && diff.insertions === commitStats.insertions && diff.deletions === commitStats.deletions,
    summary: String(flow.captured.diff_document || '').trim().slice(0, 4000)
  };
}

let token;
try {
  console.log(`Connecting to RocketRide at ${uri}…`);
  await client.connect();
  const run = await client.use({ pipeline, pipelineTraceLevel: 'full', name: 'Signal delivery review' });
  token = run.token;
  await client.addMonitor({ token }, ['flow']);
  const { repoPath: _localPath, ...shared } = deliveryBundle;
  const rawResult = await client.send(token, JSON.stringify({ ...shared, numberedDiff: numbered.slice(0, 300_000) }, null, 2), { name: inputPath.split('/').at(-1), signalDeliveryReview: true }, 'application/json');
  if (!rawResult) throw new Error('RocketRide returned no delivery review.');
  const review = normalizeDeliveryReview(unwrapRocketRideResponse(rawResult), diffLines);
  review.agent = agentEvidence();
  if (!review.agent.calls.some(call => call.tool === 'diff')) throw new Error('The diff reader agent did not call git_reader.diff.');
  review.provenance = { engineUri: uri, pipeline: pipelinePath.split('/').at(-1), pipelineTraceLevel: 'full', taskTokenPrefix: token.slice(0, 10), importedFrom: inputPath.split('/').at(-1), ...engineTrace(flow.summarize()) };
  await writeFile(outputPath, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
  console.log(`Live RocketRide delivery review written to ${outputPath}`);
} finally {
  if (token) {
    try { await client.terminate(token); } catch { /* A completed task may already be gone. */ }
  }
  try { await client.disconnect(); } catch { /* Never hide the original delivery failure. */ }
}
