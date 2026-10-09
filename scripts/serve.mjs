import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { spawn } from 'node:child_process';

const root = new URL('../', import.meta.url).pathname;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const maxBodyBytes = 1_000_000;
const executions = new Map();

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

function executionConfig() {
  const repo = process.env.SIGNAL_EXECUTION_REPO;
  const remote = process.env.SIGNAL_EXECUTION_REMOTE || 'origin';
  const enabled = process.env.SIGNAL_EXECUTION_ENABLED === '1' && Boolean(repo);
  const deliveryReviewEnabled = enabled && process.env.SIGNAL_DELIVERY_REVIEW_ENABLED === '1';
  return {
    enabled,
    deliveryReviewEnabled,
    deliveryReviewRequired: deliveryReviewEnabled && process.env.SIGNAL_DELIVERY_REVIEW_REQUIRED === '1',
    repo: repo ? repo.split('/').at(-1) : null,
    remote,
    base: process.env.SIGNAL_EXECUTION_BASE || 'main',
    message: enabled
      ? 'Trusted repository execution is enabled.'
      : 'Execution is disabled. Configure SIGNAL_EXECUTION_ENABLED=1 and SIGNAL_EXECUTION_REPO on the local server to dispatch code, tests, and pull requests.'
  };
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) throw new Error('Evidence bundle is larger than 1 MB.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function runAnalyzeApi(request, response) {
  try {
    const raw = await readBody(request);
    const parsed = raw.trim() ? JSON.parse(raw) : {};
    const evidence = String(parsed.evidence || '').trim()
      || await readFile(join(root, 'data/sample-evidence.txt'), 'utf8');
    const runDir = await mkdtemp(join(tmpdir(), 'signal-room-'));
    const inputPath = join(runDir, 'evidence.txt');
    const outputPath = join(root, 'data/live-report.json');
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
      sendJson(response, 502, {
        ok: false,
        message: 'RocketRide did not produce a live report.',
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
      return;
    }

    const report = JSON.parse(await readFile(outputPath, 'utf8'));
    sendJson(response, 200, { ok: true, stdout: stdout.trim(), report });
  } catch (error) {
    sendJson(response, 400, {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    });
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
    const title = String(payload.title || 'Signal build mission').trim().slice(0, 120);
    const brief = String(payload.brief || '').trim().slice(0, 20_000);
    if (!brief) throw new Error('A mission brief is required before implementation can start.');
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const runDir = await mkdtemp(join(tmpdir(), 'signal-execution-'));
    const inputPath = join(runDir, 'mission.json');
    await writeFile(inputPath, JSON.stringify({ title, brief }, null, 2));
    const execution = { id, status: 'queued', detail: 'Preparing the trusted repository.', logs: [], prUrl: null };
    executions.set(id, execution);
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
          if (event.phase === 'complete' && /^https:\/\//.test(event.detail)) execution.prUrl = event.detail;
        } catch { /* Ignore non-structured command output. */ }
      });
    });
    child.stderr.on('data', chunk => { execution.logs.push({ phase: 'stderr', detail: chunk.toString().slice(0, 2000) }); });
    child.on('close', code => {
      if (code === 0) {
        execution.status = 'complete';
        execution.detail = execution.prUrl || 'The coding run completed.';
      } else {
        execution.status = 'failed';
        execution.detail = 'The coding run stopped before a pull request was opened.';
      }
    });
    sendJson(response, 202, { ok: true, execution });
  } catch (error) {
    sendJson(response, 400, { ok: false, message: error instanceof Error ? error.message : String(error) });
  }
}

const server = createServer(async (request, response) => {
  const pathname = request.url?.split('?')[0];
  if (request.method === 'GET' && pathname === '/api/execution-status') {
    sendJson(response, 200, executionConfig());
    return;
  }
  if (request.method === 'POST' && pathname === '/api/execute') {
    await startExecution(request, response);
    return;
  }
  const executionMatch = pathname?.match(/^\/api\/executions\/([a-zA-Z0-9-]+)$/);
  if (request.method === 'GET' && executionMatch) {
    const execution = executions.get(executionMatch[1]);
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

server.listen(port, '127.0.0.1', () => console.log(`Signal Room: http://127.0.0.1:${port}`));
