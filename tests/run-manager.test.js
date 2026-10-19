import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

// The manager runs real child processes; a fake root supplies stand-in scripts.
const root = await mkdtemp(join(tmpdir(), 'signal-manager-test-'));
process.env.SIGNAL_RUNS_DIR = join(root, 'runs');
const { createRunManager, isSameProcess, RunError } = await import('../scripts/run-manager.mjs');
const { createRun, readRun } = await import('../scripts/run-store.mjs');

await mkdir(join(root, 'scripts'), { recursive: true });
// Scope runner stand-in: FAKE_MODE=ok streams two steps and writes a report;
// FAKE_MODE=hang starts a grandchild and waits, so cancel must stop both.
await writeFile(join(root, 'scripts/rocketride-run.mjs'), `
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const output = process.argv[process.argv.indexOf('--output') + 1];
const say = event => process.stdout.write(JSON.stringify(event) + '\\n');
if (process.env.FAKE_MODE === 'hang') {
  const grandchild = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: 'ignore' });
  writeFileSync(process.env.FAKE_PIDS, JSON.stringify([process.pid, grandchild.pid]));
  say({ type: 'signal-flow', step: 'Parse evidence', at: Date.now() });
  setTimeout(() => {}, 120000);
} else if (process.env.FAKE_MODE === 'offline') {
  say({ type: 'signal-error', code: 'engine-offline', message: 'Failed to connect to ws://localhost:5565' });
  process.exit(1);
} else {
  say({ type: 'signal-flow', step: 'Parse evidence', at: Date.now() });
  say({ type: 'signal-flow', step: 'Customer advocate', at: Date.now() + 5 });
  writeFileSync(output, JSON.stringify({ mode: 'live', reportId: 'fake', sources: [], proofs: [], provenance: {} }));
}
`);

const upload = { id: 'upload_1', name: 'notes.txt', kind: 'TXT', mimeType: 'text/plain', size: 5, sha256: 'x', buffer: Buffer.from('notes') };
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const until = async (check, ms = 5000) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (await check()) return true; await new Promise(resolveWait => setTimeout(resolveWait, 50)); }
  return false;
};

test('a scope run streams progress, completes, and hands over its report', async () => {
  let handedOver;
  const manager = createRunManager({ root, env: { ...process.env, FAKE_MODE: 'ok' }, onScopeComplete: async report => { handedOver = report; } });
  const run = await manager.startScope({ brief: 'Do the thing', uploads: [upload] });
  await manager.wait(run.id);
  const record = await readRun(run.id);
  assert.equal(record.status, 'complete');
  assert.deepEqual(record.progress.steps.map(step => step.step), ['Parse evidence', 'Customer advocate']);
  assert.equal(record.report.provenance.runId, run.id);
  assert.equal(handedOver.reportId, 'fake');
  assert.equal(await readFile(join(process.env.SIGNAL_RUNS_DIR, run.id, 'input', '1-notes.txt'), 'utf8'), 'notes');
});

test('runner failures keep their typed error code', async () => {
  const manager = createRunManager({ root, env: { ...process.env, FAKE_MODE: 'offline' } });
  const run = await manager.startScope({ brief: 'x', uploads: [upload] });
  await manager.wait(run.id);
  const record = await readRun(run.id);
  assert.equal(record.status, 'failed');
  assert.equal(record.error.code, 'engine-offline');
});

test('a second scope run attaches to the active one, and cancel stops the process tree', async () => {
  const pidsFile = join(root, 'pids.json');
  const manager = createRunManager({ root, env: { ...process.env, FAKE_MODE: 'hang', FAKE_PIDS: pidsFile } });
  const run = await manager.startScope({ brief: 'x', uploads: [upload] });
  await assert.rejects(manager.startScope({ brief: 'y', uploads: [upload] }), error => error instanceof RunError && error.status === 409 && error.extra.activeRunId === run.id);
  assert.ok(await until(async () => readFile(pidsFile, 'utf8').then(() => true, () => false)));
  const pids = JSON.parse(await readFile(pidsFile, 'utf8'));
  await manager.cancel(run.id);
  await manager.wait(run.id);
  assert.equal((await readRun(run.id)).status, 'cancelled');
  assert.ok(await until(() => pids.every(pid => !alive(pid))), 'runner and grandchild should both be stopped');
});

test('restart recovery stops our orphaned process but never a reused pid', async () => {
  const orphan = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { detached: true, stdio: 'ignore' });
  await until(() => isSameProcess(orphan.pid, Date.now()), 3000);
  const ours = await createRun({ kind: 'scope', status: 'running', process: { pid: orphan.pid, startedAt: Date.now() } });
  const stranger = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: 'ignore' });
  // Same pid recorded, but a start time from long ago: not the process we spawned.
  const reused = await createRun({ kind: 'implementation', status: 'running', process: { pid: stranger.pid, startedAt: Date.now() - 3_600_000 }, execution: { status: 'implementing' } });
  const recovered = await createRunManager({ root }).recover(process.env.SIGNAL_RUNS_DIR);
  assert.ok(recovered >= 2);
  assert.equal((await readRun(ours.id)).status, 'interrupted');
  assert.equal((await readRun(reused.id)).execution.status, 'interrupted');
  assert.ok(await until(() => !alive(orphan.pid)));
  assert.equal(alive(stranger.pid), true);
  stranger.kill();
});

test('pruning keeps the newest runs and deletes kept branches of older failures', async () => {
  const { pruneRuns, runArtifactsDir } = await import('../scripts/run-store.mjs');
  const old = await createRun({ kind: 'implementation', status: 'failed', createdAt: '2000-01-01T00:00:00.000Z', execution: { failure: { localBranch: 'signal/old-run' } } });
  await mkdir(runArtifactsDir(old.id), { recursive: true });
  const deleted = [];
  const removed = await pruneRuns({ keep: 2, deleteBranch: async branch => { deleted.push(branch); } });
  assert.ok(removed.includes(old.id));
  assert.deepEqual(deleted, ['signal/old-run']);
  await assert.rejects(readRun(old.id));
  await assert.rejects(readFile(join(runArtifactsDir(old.id), 'missing')));
});
