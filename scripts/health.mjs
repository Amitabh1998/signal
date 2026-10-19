import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { RocketRideClient } from 'rocketride';

// Live readiness, shared by GET /api/health and the preflight before each run.
// Engine checks are cached briefly; pipeline validation is cached per file hash.
const pipelineFiles = ['evidence-parse.pipe', 'signal-room.pipe', 'delivery-review.pipe'];
const validated = new Map();
let engineCache = { at: 0, value: null };
let runnerCache = { at: 0, value: null };

function withTimeout(promise, ms, message) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))]);
}

const run = (command, args, options = {}) => new Promise(resolveRun => {
  execFile(command, args, { timeout: 10_000, ...options }, (error, stdout, stderr) => resolveRun({ ok: !error, code: error?.code, stdout: String(stdout), stderr: String(stderr) }));
});

export function createHealth({ root, env = process.env }) {
  const uri = () => env.ROCKETRIDE_URI || 'ws://localhost:5565';

  // The badge uses a quick timeout; a preflight waits longer for a busy engine.
  async function engine({ fresh = false, timeoutMs = 3000 } = {}) {
    if (!fresh && engineCache.value && Date.now() - engineCache.at < 5000) return engineCache.value;
    const client = new RocketRideClient({ uri: uri(), auth: env.ROCKETRIDE_AUTH || env.ROCKETRIDE_APIKEY || undefined, persist: false, requestTimeout: 8000, clientName: 'Signal health' });
    const started = performance.now();
    let value;
    try {
      await withTimeout(client.connect(), timeoutMs, `Could not reach RocketRide at ${uri()}.`);
      await withTimeout(client.ping(), timeoutMs, `RocketRide at ${uri()} did not answer a ping.`);
      const pipelines = [];
      for (const file of pipelineFiles) {
        const raw = await readFile(join(root, 'pipelines', file), 'utf8');
        const hash = createHash('sha256').update(raw).digest('hex');
        if (!validated.has(hash)) {
          const result = await withTimeout(client.validate({ pipeline: JSON.parse(raw) }), 8000, `Validating ${file} timed out.`);
          validated.set(hash, { errors: result.errors.length, warnings: result.warnings.length });
        }
        pipelines.push({ name: file, ok: validated.get(hash).errors === 0, ...validated.get(hash) });
      }
      value = { ok: pipelines.every(pipeline => pipeline.ok), uri: uri(), latencyMs: Math.round(performance.now() - started), pipelines, code: pipelines.every(pipeline => pipeline.ok) ? null : 'pipeline-invalid' };
    } catch (error) {
      value = { ok: false, uri: uri(), code: 'engine-offline', message: error instanceof Error ? error.message : String(error), hint: 'Start the RocketRide engine (npm run rocketride:up, or the native server), then retry.' };
    } finally {
      try { await client.disconnect(); } catch { /* Never mask the check result. */ }
    }
    engineCache = { at: Date.now(), value };
    return value;
  }

  async function runner() {
    if (runnerCache.value && Date.now() - runnerCache.at < 60_000) return runnerCache.value;
    const name = env.SIGNAL_EXECUTION_RUNNER === 'codex' ? 'codex' : 'claude';
    const result = name === 'codex' ? await run('codex', ['login', 'status']) : await run('claude', ['auth', 'status']);
    let connected = false;
    if (name === 'codex') connected = result.ok && /logged in/i.test(`${result.stdout}${result.stderr}`);
    else { try { connected = Boolean(JSON.parse(result.stdout).loggedIn); } catch { connected = false; } }
    const value = { ok: connected, name, code: connected ? null : result.code === 'ENOENT' ? 'runner-missing' : 'runner-signed-out' };
    runnerCache = { at: Date.now(), value };
    return value;
  }

  async function repository() {
    const repo = env.SIGNAL_EXECUTION_REPO;
    if (env.SIGNAL_EXECUTION_ENABLED !== '1' || !repo) return { ok: false, enabled: false, code: 'execution-disabled' };
    const remote = env.SIGNAL_EXECUTION_REMOTE || 'origin';
    const inside = await run('git', ['-C', repo, 'rev-parse', '--is-inside-work-tree']);
    const hasRemote = inside.ok && (await run('git', ['-C', repo, 'remote', 'get-url', remote])).ok;
    return { ok: inside.ok && hasRemote, enabled: true, name: repo.split('/').at(-1), code: !inside.ok ? 'repo-missing' : hasRemote ? null : 'repo-no-remote' };
  }

  async function snapshot() {
    const [engineState, runnerState, repoState] = await Promise.all([engine(), runner(), repository()]);
    return { checkedAt: new Date().toISOString(), engine: engineState, runner: runnerState, repository: repoState };
  }

  return { engine, runner, repository, snapshot };
}
