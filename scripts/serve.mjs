import { createReadStream } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { spawn } from 'node:child_process';
import { acceptUploads } from './evidence-ingestion.mjs';
import { createHealth } from './health.mjs';
import { createRunManager, RunError } from './run-manager.mjs';
import { listScopeDecisions, readRun, runStoreDir } from './run-store.mjs';

const root = new URL('../', import.meta.url).pathname;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const maxBodyBytes = 12_000_000;

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

// Only the app shell and public demo data are served. Never .env, .git,
// .context, run records, or uploads.
const publicPaths = [/^\/index\.html$/, /^\/src\/[\w./-]+$/, /^\/docs\/assets\/[\w./-]+$/, /^\/data\/(live-report\.json|sample-evidence\.txt)$/, /^\/data\/(scenarios|source-packs)\/[\w./-]+$/];
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);

const health = createHealth({ root });
const runs = createRunManager({
  root,
  onScopeComplete: report => writeFile(join(root, 'data/live-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
});

function sendError(response, error) {
  if (error instanceof RunError) {
    sendJson(response, error.status, { ok: false, code: error.code, message: error.message, ...error.extra });
    return;
  }
  sendJson(response, 400, { ok: false, code: 'bad-request', message: error instanceof Error ? error.message : String(error) });
}

// Preflight: a run that cannot finish fails before it starts, with a typed code.
async function requireEngine() {
  const engine = await health.engine({ fresh: true, timeoutMs: 10_000 });
  if (!engine.ok) throw new RunError(503, engine.code, engine.message || 'A RocketRide pipeline failed validation.', { hint: engine.hint, pipelines: engine.pipelines });
}

async function analyze(request, response, url) {
  try {
    const parsed = JSON.parse((await readBody(request)) || '{}');
    const brief = String(parsed.brief || '').trim();
    let uploads = acceptUploads(Array.isArray(parsed.files) ? parsed.files : []);
    // Without attachments, pasted evidence (or the bundled sample) is one text file.
    if (!uploads.length) {
      const text = String(parsed.evidence || '').trim() || await readFile(join(root, 'data/sample-evidence.txt'), 'utf8');
      uploads = acceptUploads([{ name: parsed.evidence ? 'pasted-evidence.txt' : 'sample-evidence.txt', dataBase64: Buffer.from(text).toString('base64') }]);
    }
    await requireEngine();
    const run = await runs.startScope({ brief, uploads });
    // ?wait=1 keeps the old synchronous contract for scripts.
    if (url.searchParams.get('wait') === '1') {
      await runs.wait(run.id);
      const finished = await readRun(run.id);
      sendJson(response, finished.status === 'complete' ? 200 : 502, { ok: finished.status === 'complete', runId: run.id, report: finished.report, error: finished.error });
      return;
    }
    sendJson(response, 202, { ok: true, runId: run.id });
  } catch (error) {
    sendError(response, error);
  }
}

async function execute(request, response) {
  const config = executionConfig();
  if (!config.enabled) {
    sendJson(response, 409, { ok: false, code: 'execution-disabled', ...config });
    return;
  }
  try {
    const payload = JSON.parse(await readBody(request));
    const mission = payload.mission && typeof payload.mission === 'object' ? payload.mission : payload;
    const title = String(mission.title || 'Signal build mission').trim().slice(0, 120);
    const brief = String(mission.brief || '').trim().slice(0, 20_000);
    if (!brief) throw new Error('A mission brief is required before implementation can start.');
    const runner = await health.runner();
    if (!runner.ok) throw new RunError(503, runner.code, `${config.runnerName} is not signed in on this machine.`, { hint: 'Open Connections and sign in, then retry.' });
    if (config.deliveryReviewRequired) await requireEngine();
    const { execution } = await runs.startImplementation({ ...mission, title, brief });
    sendJson(response, 202, { ok: true, execution });
  } catch (error) {
    sendError(response, error);
  }
}

const server = createServer(async (request, response) => {
  // Reject DNS-rebinding requests: only this machine's own origin may talk to Signal.
  if (!allowedHosts.has(String(request.headers.host || ''))) {
    response.writeHead(421, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Misdirected request');
    return;
  }
  const url = new URL(request.url || '/', `http://${request.headers.host}`);
  const pathname = url.pathname;
  const runMatch = pathname.match(/^\/api\/runs\/([a-zA-Z0-9_-]+)$/);
  if (request.method === 'GET' && runMatch) {
    try {
      sendJson(response, 200, { ok: true, run: await readRun(runMatch[1]), active: runs.isActive(runMatch[1]) });
    } catch (error) {
      sendJson(response, error?.code === 'ENOENT' ? 404 : 400, { ok: false, message: 'Run not found.' });
    }
    return;
  }
  const cancelMatch = pathname.match(/^\/api\/runs\/([a-zA-Z0-9_-]+)\/cancel$/);
  if (request.method === 'POST' && cancelMatch) {
    try { sendJson(response, 202, { ok: true, ...(await runs.cancel(cancelMatch[1])) }); } catch (error) { sendError(response, error); }
    return;
  }
  if (request.method === 'GET' && pathname === '/api/health') {
    sendJson(response, 200, await health.snapshot());
    return;
  }
  if (request.method === 'GET' && pathname === '/api/decisions') {
    sendJson(response, 200, { ok: true, decisions: await listScopeDecisions() });
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
  const runnerLoginMatch = pathname.match(/^\/api\/runners\/(codex|claude)\/login$/);
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
    await execute(request, response);
    return;
  }
  const executionMatch = pathname.match(/^\/api\/executions\/([a-zA-Z0-9_-]+)$/);
  if (request.method === 'GET' && executionMatch) {
    try {
      const run = await readRun(executionMatch[1]);
      if (!run.execution) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      sendJson(response, 200, { ok: true, execution: run.execution, status: run.status, active: runs.isActive(run.id) });
    } catch {
      sendJson(response, 404, { ok: false, message: 'Execution not found.' });
    }
    return;
  }
  if (request.method === 'POST' && pathname === '/api/analyze') {
    await analyze(request, response, url);
    return;
  }

  const path = normalize(decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
  if (request.method !== 'GET' || !publicPaths.some(pattern => pattern.test(path))) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  const file = join(root, path);
  try {
    if (!(await stat(file)).isFile()) throw new Error('not a file');
    response.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

const interrupted = await runs.recover(runStoreDir);
if (interrupted) console.log(`Marked ${interrupted} interrupted run(s); their processes were stopped.`);
// Stop every run's process tree on shutdown instead of leaving orphans.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    server.close();
    await runs.shutdown();
    process.exit(0);
  });
}
server.listen(port, '127.0.0.1', () => console.log(`Signal Room: http://127.0.0.1:${port}`));
