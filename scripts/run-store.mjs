import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const storeDir = resolve('data/runs');

function safeId(value) {
  const id = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!id) throw new Error('A valid run id is required.');
  return id;
}

function filepath(id) {
  return join(storeDir, `${safeId(id)}.json`);
}

async function persist(record) {
  await mkdir(storeDir, { recursive: true });
  const target = filepath(record.id);
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  await rename(temporary, target);
  return record;
}

export async function createRun(input = {}) {
  const now = new Date().toISOString();
  return persist({
    schemaVersion: 1,
    id: `run_${Date.now()}_${randomUUID().slice(0, 8)}`,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    events: [],
    ...input
  });
}

export async function readRun(id) {
  return JSON.parse(await readFile(filepath(id), 'utf8'));
}

export async function updateRun(id, patch = {}) {
  const current = await readRun(id);
  const next = {
    ...current,
    ...patch,
    id: current.id,
    updatedAt: new Date().toISOString()
  };
  return persist(next);
}

export async function appendRunEvent(id, event) {
  const current = await readRun(id);
  return updateRun(id, {
    events: [...(current.events || []), { at: new Date().toISOString(), ...event }].slice(-500)
  });
}

// Runs are driven by the server process that created them. After a restart,
// any record still marked active can never finish, so close it honestly.
export async function failInterruptedRuns() {
  let names;
  try { names = await readdir(storeDir); } catch { return 0; }
  let count = 0;
  for (const name of names.filter(entry => entry.endsWith('.json'))) {
    try {
      const run = JSON.parse(await readFile(join(storeDir, name), 'utf8'));
      if (['complete', 'failed'].includes(run.status)) continue;
      const error = 'The Signal server stopped before this run finished.';
      await updateRun(run.id, {
        status: 'failed',
        error,
        ...(run.execution ? { execution: { ...run.execution, status: 'failed', detail: error } } : {})
      });
      count += 1;
    } catch { /* Skip unreadable records. */ }
  }
  return count;
}
