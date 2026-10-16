import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { spawn } from 'node:child_process';
import { buildEvidenceBundle, ingestEvidenceFiles } from './evidence-ingestion.mjs';
import { createRun, failInterruptedRuns, readRun, updateRun } from './run-store.mjs';
import { verifyReportProofs } from '../src/proof-verification.js';

const root = new URL('../', import.meta.url).pathname;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const maxBodyBytes = 12_000_000;
const executions = new Map();
const executionWrites = new Map();
let scopeWorkflowRunning = false;

function persistExecution(execution) {
  const previous = executionWrites.get(execution.id) || Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(() => updateRun(execution.id, { status: execution.status, execution }));
  executionWrites.set(execution.id, next);
  return next;
}

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

await loadDotEnv(join(root, '.env'));
const port = Number(process.env.PORT || 4173);

function buildRunner() {
  return process.env.SIGNAL_EXECUTION_RUNNER === 'codex' ? 'codex' : 'claude';
}

function executionConfig() {
  const repo = process.env.SIGNAL_EXECUTION_REPO;
  const remote = process.env.SIGNAL_EXECUTION_REMOTE || 'origin';
  const enabled = process.env.SIGNAL_EXECUTION_ENABLED === '1' && Boolean(repo);
  const deliveryReviewEnabled = enabled && process.env.SIGNAL_DELIVERY_REVIEW_ENABLED === '1';
  const runner = buildRunner();
  return {
    enabled,
    runner,
    runnerName: runner === 'codex' ? 'Codex CLI' : 'Claude Code',
    deliveryReviewEnabled,
    deliveryReviewRequired: deliveryReviewEnabled && process.env.SIGNAL_DELIVERY_REVIEW_REQUIRED === '1',
    repo: repo ? repo.split('/').at(-1) : null,
    remote,
    prMode: process.env.SIGNAL_EXECUTION_PR_MODE === 'local' ? 'local review branch' : 'GitHub pull request',
    base: process.env.SIGNAL_EXECUTION_BASE || 'main',
    message: enabled
      ? `Trusted repository execution is enabled. Signal will branch from ${remote}/${process.env.SIGNAL_EXECUTION_BASE || 'main'} and create a ${process.env.SIGNAL_EXECUTION_PR_MODE === 'local' ? 'local review branch' : 'GitHub pull request'}.`
      : 'Execution is disabled. Configure SIGNAL_EXECUTION_ENABLED=1 and SIGNAL_EXECUTION_REPO on the local server to dispatch code, tests, and pull requests.'
  };
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function collectCommand(command, args) {
  return new Promise(resolve => {
    let child;
    try {
      child = spawn(command, args, { cwd: root, env: process.env });
    } catch (error) {
      resolve({ code: -1, output: '', error: error instanceof Error ? error.message : String(error) });
      return;
    }
    let output = '';
    let errorOutput = '';
    child.stdout.on('data', chunk => { output = `${output}${chunk}`.slice(-12_000); });
    child.stderr.on('data', chunk => { errorOutput = `${errorOutput}${chunk}`.slice(-12_000); });
    child.on('error', error => resolve({ code: -1, output, error: error.message }));
    child.on('close', code => resolve({ code: code ?? -1, output, error: errorOutput }));
  });
}

async function runnerStatus() {
  const [codex, claude] = await Promise.all([
    collectCommand('codex', ['login', 'status']),
    collectCommand('claude', ['auth', 'status'])
  ]);
  const codexStatus = `${codex.output}\n${codex.error}`;
  let claudeState;
  try { claudeState = JSON.parse(claude.output); } catch { claudeState = null; }
  return {
    runners: [
      {
        id: 'codex',
        name: 'Codex',
        availableForBuilds: buildRunner() === 'codex',
        installed: codex.code !== -1,
        connected: codex.code === 0 && /logged in/i.test(codexStatus),
        detail: codex.code === -1 ? 'Codex CLI is not installed.' : codex.code === 0 ? 'Connected on this Mac.' : 'Not connected on this Mac.'
      },
      {
        id: 'claude',
        name: 'Claude Code',
        availableForBuilds: buildRunner() === 'claude',
        installed: claude.code !== -1,
        connected: Boolean(claudeState?.loggedIn),
        detail: claude.code === -1 ? 'Claude Code is not installed.' : claudeState?.loggedIn ? 'Connected on this Mac.' : 'Not connected on this Mac.'
      }
    ]
  };
}

function startRunnerLogin(runner) {
  if (process.platform !== 'darwin') throw new Error('Built-in CLI login currently requires Signal to run on macOS.');
  const commands = {
    codex: 'codex login --device-auth',
    claude: 'claude auth login --claudeai'
  };
  const command = commands[runner];
  if (!command) throw new Error('Unknown coding runner.');
  return collectCommand('osascript', ['-e', `tell application "Terminal" to do script "${command}"`]);
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) throw new Error('Request body is larger than 12 MB.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function runAnalyzeApi(request, response) {
  if (scopeWorkflowRunning) {
    sendJson(response, 409, {
      ok: false,
      code: 'scope-workflow-running',
      message: 'A RocketRide scope workflow is already running. Wait for that decision before starting another one.'
    });
    return;
  }

  scopeWorkflowRunning = true;
  let runRecord;
  let runDir;
  try {
    const raw = await readBody(request);
    const parsed = raw.trim() ? JSON.parse(raw) : {};
    const uploadedSources = await ingestEvidenceFiles(Array.isArray(parsed.files) ? parsed.files : []);
    const fallbackEvidence = uploadedSources.length || String(parsed.evidence || '').trim()
      ? String(parsed.evidence || '').trim()
      : await readFile(join(root, 'data/sample-evidence.txt'), 'utf8');
    const evidence = buildEvidenceBundle({
      brief: String(parsed.brief || ''),
      evidence: fallbackEvidence,
      sources: uploadedSources
    });
    runRecord = await createRun({
      kind: 'scope',
      status: 'running',
      brief: String(parsed.brief || '').trim(),
      evidence: uploadedSources.map(({ id, name, kind, mimeType, size, sha256 }) => ({ id, name, kind, mimeType, size, sha256 })),
      parsedEvidence: uploadedSources.map(({ id, name, kind, content }) => ({ id, name, kind, content })),
      provenance: { mode: 'live', runner: 'rocketride' }
    });
    runDir = await mkdtemp(join(tmpdir(), 'signal-room-'));
    const inputPath = join(runDir, 'evidence.txt');
    const outputPath = join(runDir, 'live-report.json');
    await writeFile(inputPath, `${evidence}\n`, 'utf8');

    const child = spawn(process.execPath, [
      join(root, 'scripts/rocketride-run.mjs'),
      '--input',
      inputPath,
      '--output',
      outputPath
    ], { cwd: root, env: process.env });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });

    const code = await new Promise(resolve => child.on('close', resolve));
    if (code !== 0) {
      await updateRun(runRecord.id, { status: 'failed', error: stderr.trim() || stdout.trim() || 'RocketRide did not produce a report.' });
      sendJson(response, 502, {
        ok: false,
        runId: runRecord.id,
        message: 'RocketRide did not produce a live report.',
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
      return;
    }

    const report = verifyReportProofs(JSON.parse(await readFile(outputPath, 'utf8')));
    report.provenance = { ...(report.provenance || {}), runId: runRecord.id };
    await updateRun(runRecord.id, {
      status: 'complete',
      completedAt: new Date().toISOString(),
      report,
      provenance: report.provenance
    });
    await writeFile(join(root, 'data/live-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    sendJson(response, 200, { ok: true, runId: runRecord.id, stdout: stdout.trim(), report });
  } catch (error) {
    if (runRecord) await updateRun(runRecord.id, { status: 'failed', error: error instanceof Error ? error.message : String(error) }).catch(() => {});
    sendJson(response, 400, {
      ok: false,
      runId: runRecord?.id,
      message: error instanceof Error ? error.message : String(error)
    });
  } finally {
    if (runDir) await rm(runDir, { recursive: true, force: true });
    scopeWorkflowRunning = false;
  }
}

async function startExecution(request, response) {
  const config = executionConfig();
  if (!config.enabled) {
    sendJson(response, 409, { ok: false, ...config });
    return;
  }
  try {
    const payload = JSON.parse(await readBody(request));
    const mission = payload.mission && typeof payload.mission === 'object' ? payload.mission : payload;
    const title = String(mission.title || 'Signal build mission').trim().slice(0, 120);
    const brief = String(mission.brief || '').trim().slice(0, 20_000);
    if (!brief) throw new Error('A mission brief is required before implementation can start.');
    const runRecord = await createRun({ kind: 'implementation', status: 'queued', mission });
    const id = runRecord.id;
    const runDir = await mkdtemp(join(tmpdir(), 'signal-execution-'));
    const inputPath = join(runDir, 'mission.json');
    await writeFile(inputPath, JSON.stringify({ ...mission, title, brief }, null, 2));
    const execution = { id, status: 'queued', detail: 'Preparing the trusted repository.', logs: [], prUrl: null };
    executions.set(id, execution);
    await persistExecution(execution);
    const child = spawn(process.execPath, [
      join(root, 'scripts/signal-execute.mjs'), '--input', inputPath, '--id', id
    ], { cwd: root, env: process.env });
    let buffer = '';
    child.stdout.on('data', chunk => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      lines.forEach(line => {
        try {
          const event = JSON.parse(line);
          if (event.type !== 'signal-execution') return;
          execution.status = event.phase;
          execution.detail = event.detail;
          execution.logs.push(event);
          if (event.deliveryReview) execution.deliveryReview = event.deliveryReview;
          if (event.reviewBranch) execution.reviewBranch = event.reviewBranch;
          if (event.phase === 'complete' && /^https:\/\//.test(event.detail)) execution.prUrl = event.detail;
          void persistExecution(execution);
        } catch { /* Ignore non-structured command output. */ }
      });
    });
    child.stderr.on('data', chunk => {
      execution.logs.push({ phase: 'stderr', detail: chunk.toString().slice(0, 2000) });
      void persistExecution(execution);
    });
    child.on('close', code => {
      if (code === 0) {
        execution.status = 'complete';
        const completed = execution.logs.findLast(event => event.phase === 'complete');
        execution.detail = execution.prUrl || completed?.detail || 'The coding run completed.';
      } else {
        execution.status = 'failed';
        const stderr = execution.logs.filter(event => event.phase === 'stderr').map(event => event.detail).join('');
        const reason = stderr.split('\n').map(line => line.trim()).findLast(line => /^\w*Error:/.test(line));
        execution.detail = reason
          ? `The coding run stopped: ${reason.replace(/^\w*Error:\s*/, '').slice(0, 400)}`
          : 'The coding run stopped before a pull request was opened.';
      }
      void persistExecution(execution);
    });
    sendJson(response, 202, { ok: true, execution });
  } catch (error) {
    sendJson(response, 400, { ok: false, message: error instanceof Error ? error.message : String(error) });
  }
}

const server = createServer(async (request, response) => {
  const pathname = request.url?.split('?')[0];
  const runMatch = pathname?.match(/^\/api\/runs\/([a-zA-Z0-9_-]+)$/);
  if (request.method === 'GET' && runMatch) {
    try {
      sendJson(response, 200, { ok: true, run: await readRun(runMatch[1]) });
    } catch (error) {
      sendJson(response, error?.code === 'ENOENT' ? 404 : 400, { ok: false, message: 'Run not found.' });
    }
    return;
  }
  if (request.method === 'GET' && pathname === '/api/execution-status') {
    sendJson(response, 200, executionConfig());
    return;
  }
  if (request.method === 'GET' && pathname === '/api/runners') {
    sendJson(response, 200, await runnerStatus());
    return;
  }
  const runnerLoginMatch = pathname?.match(/^\/api\/runners\/(codex|claude)\/login$/);
  if (request.method === 'POST' && runnerLoginMatch) {
    try {
      const result = await startRunnerLogin(runnerLoginMatch[1]);
      if (result.code !== 0) throw new Error(result.error || 'Could not open the local Terminal login flow.');
      sendJson(response, 202, { ok: true, message: 'Terminal opened. Complete the official sign-in there, then refresh the connection state in Signal.' });
    } catch (error) {
      sendJson(response, 400, { ok: false, message: error instanceof Error ? error.message : String(error) });
    }
    return;
  }
  if (request.method === 'POST' && pathname === '/api/execute') {
    await startExecution(request, response);
    return;
  }
  const executionMatch = pathname?.match(/^\/api\/executions\/([a-zA-Z0-9_-]+)$/);
  if (request.method === 'GET' && executionMatch) {
    let execution = executions.get(executionMatch[1]);
    if (!execution) {
      try { execution = (await readRun(executionMatch[1])).execution; } catch { /* handled below */ }
    }
    if (!execution) sendJson(response, 404, { ok: false, message: 'Execution not found.' });
    else sendJson(response, 200, { ok: true, execution });
    return;
  }
  if (request.method === 'POST' && request.url?.split('?')[0] === '/api/analyze') {
    await runAnalyzeApi(request, response);
    return;
  }

  const path = normalize(decodeURIComponent(request.url?.split('?')[0] || '/')).replace(/^(\.\.[/\\])+/, '');
  let file = join(root, path === '/' ? 'index.html' : path);
  if (!file.startsWith(root)) file = join(root, 'index.html');
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    response.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

const interrupted = await failInterruptedRuns();
if (interrupted) console.log(`Marked ${interrupted} interrupted run(s) as failed.`);
server.listen(port, '127.0.0.1', () => console.log(`Signal Room: http://127.0.0.1:${port}`));
