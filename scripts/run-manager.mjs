import { execFileSync, spawn } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRun, readRun, runArtifactsDir, updateRun } from './run-store.mjs';
import { verifyReportProofs } from '../src/proof-verification.js';

// Owns every scope and implementation run: one process group per run, every
// state change persisted before it is reported, at most one scope run and one
// implementation run per trusted repository, and clean cancel, shutdown, and
// restart recovery.
export const terminalStatuses = new Set(['complete', 'failed', 'cancelled', 'interrupted']);

export class RunError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

function processStartedAt(pid) {
  try {
    const started = Date.parse(execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8' }).trim());
    return Number.isFinite(started) ? started : null;
  } catch {
    return null;
  }
}

// A recorded pid is only ours if a process with that pid started when we spawned it.
export function isSameProcess(pid, startedAt) {
  const actual = pid && processStartedAt(pid);
  return Boolean(actual && Math.abs(actual - startedAt) < 5000);
}

function killGroup(pid, signal = 'SIGTERM') {
  try { process.kill(-pid, signal); return true; } catch { return false; }
}

function lines(stream, onLine) {
  let buffer = '';
  stream.on('data', chunk => {
    buffer += chunk;
    const parts = buffer.split('\n');
    buffer = parts.pop() || '';
    parts.forEach(onLine);
  });
}

export function createRunManager({ root, env = process.env, onScopeComplete = async () => {} } = {}) {
  const active = new Map();
  const writes = new Map();

  // Updates to one run are serialized so concurrent events never interleave.
  function persist(id, patch) {
    const next = (writes.get(id) || Promise.resolve()).catch(() => {}).then(() => updateRun(id, patch));
    writes.set(id, next);
    return next;
  }

  function activeOf(kind, key) {
    return [...active.values()].find(entry => entry.kind === kind && (key === undefined || entry.key === key));
  }

  function launch(id, kind, key, command, args, { onStdoutLine, onClose }) {
    const child = spawn(command, args, { cwd: root, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const entry = { id, kind, key, child, cancelRequested: false, done: null };
    entry.done = new Promise(resolveDone => {
      let stderr = '';
      lines(child.stdout, onStdoutLine);
      child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-20_000); });
      child.on('close', async code => {
        active.delete(id);
        await onClose({ code, stderr, cancelled: entry.cancelRequested }).catch(() => {});
        await writes.get(id)?.catch(() => {});
        resolveDone();
      });
    });
    active.set(id, entry);
    void persist(id, { process: { pid: child.pid, startedAt: Date.now(), command: args[0]?.split('/').at(-1) } });
    return entry;
  }

  async function startScope({ brief, uploads }) {
    const running = activeOf('scope');
    if (running) throw new RunError(409, 'run-active', 'A RocketRide scope workflow is already running. Signal attached to it.', { activeRunId: running.id, kind: 'scope' });
    const run = await createRun({
      kind: 'scope',
      status: 'running',
      brief,
      evidence: uploads.map(({ id, name, kind, mimeType, size, sha256 }) => ({ id, name, kind, mimeType, size, sha256 })),
      progress: { startedAt: Date.now(), steps: [] },
      provenance: { mode: 'live', runner: 'rocketride' }
    });
    const dir = runArtifactsDir(run.id);
    const inputDir = join(dir, 'input');
    await mkdir(inputDir, { recursive: true });
    const manifest = [];
    for (const [index, upload] of uploads.entries()) {
      const path = join(inputDir, `${index + 1}-${upload.name}`);
      await writeFile(path, upload.buffer);
      manifest.push({ name: upload.name, path, mimeType: upload.mimeType, kind: upload.kind, size: upload.size, sha256: upload.sha256 });
    }
    await writeFile(join(inputDir, 'files.json'), JSON.stringify(manifest, null, 2), 'utf8');
    await writeFile(join(inputDir, 'brief.txt'), brief, 'utf8');

    const progress = { startedAt: Date.now(), steps: [] };
    let typedError = null;
    const outputPath = join(dir, 'report.json');
    launch(run.id, 'scope', 'scope', process.execPath, [
      join(root, 'scripts/rocketride-run.mjs'), '--files', join(inputDir, 'files.json'), '--brief', join(inputDir, 'brief.txt'), '--output', outputPath
    ], {
      onStdoutLine: line => {
        try {
          const event = JSON.parse(line);
          if (event.type === 'signal-flow') {
            progress.steps.push({ step: event.step, startedMs: event.at - progress.startedAt });
            void persist(run.id, { progress: { ...progress, steps: [...progress.steps] } });
          } else if (event.type === 'signal-error') {
            typedError = { code: event.code, message: event.message };
          }
        } catch { /* Plain log line. */ }
      },
      onClose: async ({ code, stderr, cancelled }) => {
        if (cancelled) return persist(run.id, { status: 'cancelled', error: { code: 'cancelled', message: 'The scope run was cancelled.' } });
        if (code !== 0) {
          await writeFile(join(dir, 'runner-stderr.log'), stderr, 'utf8').catch(() => {});
          return persist(run.id, { status: 'failed', error: typedError || { code: 'workflow-failed', message: stderr.trim().split('\n').at(-1) || 'RocketRide did not produce a report.' } });
        }
        const report = verifyReportProofs(JSON.parse(await readFile(outputPath, 'utf8')));
        report.provenance = { ...(report.provenance || {}), runId: run.id };
        await persist(run.id, { status: 'complete', completedAt: new Date().toISOString(), parsedEvidence: report.parsedEvidence || [], report, provenance: report.provenance });
        await onScopeComplete(report);
      }
    });
    return run;
  }

  async function startImplementation(mission) {
    const repo = env.SIGNAL_EXECUTION_REPO;
    const running = activeOf('implementation', repo);
    if (running) throw new RunError(409, 'run-active', 'An implementation run is already working on this repository. Signal attached to it.', { activeRunId: running.id, kind: 'implementation' });
    const run = await createRun({ kind: 'implementation', status: 'running', mission });
    const dir = runArtifactsDir(run.id);
    await mkdir(dir, { recursive: true });
    const inputPath = join(dir, 'mission-input.json');
    await writeFile(inputPath, JSON.stringify(mission, null, 2), 'utf8');
    const execution = { id: run.id, status: 'queued', detail: 'Preparing the trusted repository.', logs: [], prUrl: null };
    await persist(run.id, { execution: { ...execution } });

    launch(run.id, 'implementation', repo, process.execPath, [
      join(root, 'scripts/signal-execute.mjs'), '--input', inputPath, '--id', run.id, '--artifacts', dir
    ], {
      onStdoutLine: line => {
        try {
          const event = JSON.parse(line);
          if (event.type !== 'signal-execution') return;
          execution.status = event.phase;
          execution.detail = event.detail;
          execution.logs.push({ phase: event.phase, detail: event.detail, at: event.at });
          if (event.deliveryReview) execution.deliveryReview = event.deliveryReview;
          if (event.reviewBranch) execution.reviewBranch = event.reviewBranch;
          if (event.failure) execution.failure = event.failure;
          if (event.phase === 'complete' && /^https:\/\//.test(event.detail)) execution.prUrl = event.detail;
          void persist(run.id, { execution: { ...execution, logs: [...execution.logs] } });
        } catch { /* Plain log line. */ }
      },
      onClose: async ({ code, stderr, cancelled }) => {
        if (code === 0) {
          execution.status = 'complete';
          const completed = execution.logs.findLast(event => event.phase === 'complete');
          execution.detail = execution.prUrl || completed?.detail || 'The coding run completed.';
        } else {
          execution.status = cancelled ? 'cancelled' : 'failed';
          execution.failure ||= { code: cancelled ? 'cancelled' : 'internal-error', stage: 'unknown', message: stderr.trim().split('\n').at(-1) || 'The executor stopped unexpectedly.', localBranch: null, artifacts: dir };
          execution.detail = cancelled
            ? 'The implementation run was cancelled.'
            : `The coding run stopped during ${execution.failure.stage}: ${execution.failure.message}`;
          if (stderr.trim()) await writeFile(join(dir, 'executor-stderr.log'), stderr, 'utf8').catch(() => {});
        }
        await persist(run.id, { status: execution.status === 'complete' ? 'complete' : execution.status, completedAt: new Date().toISOString(), execution: { ...execution } });
      }
    });
    return { run, execution };
  }

  async function cancel(id) {
    const entry = active.get(id);
    if (!entry) throw new RunError(409, 'run-not-active', 'That run is not running.');
    entry.cancelRequested = true;
    killGroup(entry.child.pid, 'SIGTERM');
    setTimeout(() => killGroup(entry.child.pid, 'SIGKILL'), 15_000).unref();
    return { id, cancelling: true };
  }

  function wait(id) {
    return active.get(id)?.done || Promise.resolve();
  }

  // Server shutdown: stop every run's process tree and record why it stopped.
  async function shutdown() {
    const entries = [...active.values()];
    for (const entry of entries) {
      entry.cancelRequested = true;
      killGroup(entry.child.pid, 'SIGTERM');
    }
    await Promise.race([Promise.all(entries.map(entry => entry.done)), new Promise(resolveWait => setTimeout(resolveWait, 4000))]);
    await Promise.all(entries.map(entry => updateRun(entry.id, { status: 'interrupted', error: { code: 'interrupted', message: 'The Signal server stopped before this run finished.' } }).catch(() => {})));
  }

  // Startup: a run still marked active belonged to a previous server. Stop its
  // process if it is still alive (verified by start time) and close the record.
  async function recover(storeDir) {
    let names = [];
    try { names = await readdir(storeDir); } catch { return 0; }
    let count = 0;
    for (const name of names.filter(entry => entry.endsWith('.json'))) {
      try {
        const run = await readRun(name.replace(/\.json$/, ''));
        if (terminalStatuses.has(run.status)) continue;
        if (run.process?.pid && isSameProcess(run.process.pid, run.process.startedAt)) killGroup(run.process.pid, 'SIGTERM');
        const error = { code: 'interrupted', message: 'The Signal server stopped before this run finished.' };
        await updateRun(run.id, {
          status: 'interrupted',
          error,
          ...(run.execution ? { execution: { ...run.execution, status: 'interrupted', detail: error.message } } : {})
        });
        count += 1;
      } catch { /* Skip unreadable records. */ }
    }
    return count;
  }

  return { startScope, startImplementation, cancel, wait, shutdown, recover, isActive: id => active.has(id) };
}
