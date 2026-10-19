import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const storeDir = resolve(process.env.SIGNAL_RUNS_DIR || 'data/runs');

function safeId(value) {
  const id = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!id) throw new Error('A valid run id is required.');
  return id;
}

function filepath(id) {
  return join(storeDir, `${safeId(id)}.json`);
}

export const runStoreDir = storeDir;

// Inputs, logs, patches, and reviews for one run live beside its record.
export function runArtifactsDir(id) {
  return join(storeDir, safeId(id));
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

// Completed live scope runs, newest first, one per distinct request.
export async function listScopeDecisions(limit = 6) {
  let names;
  try { names = await readdir(storeDir); } catch { return []; }
  const runs = [];
  for (const name of names.filter(entry => entry.endsWith('.json'))) {
    try {
      const run = JSON.parse(await readFile(join(storeDir, name), 'utf8'));
      if (run.kind === 'scope' && run.status === 'complete' && run.report?.mode === 'live') runs.push(run);
    } catch { /* Skip unreadable records. */ }
  }
  const seen = new Set();
  return runs
    .sort((a, b) => String(b.completedAt || b.createdAt).localeCompare(String(a.completedAt || a.createdAt)))
    .filter(run => {
      const key = String(run.brief || '').trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map(run => ({
      id: run.id,
      completedAt: run.completedAt,
      brief: run.brief,
      sources: (run.evidence || []).map(item => item.name),
      reportId: run.report.reportId,
      recommendation: { title: run.report.recommendation?.title, summary: run.report.recommendation?.summary, confidence: run.report.recommendation?.confidence },
      contradiction: { title: run.report.contradiction?.title },
      experiment: { title: run.report.experiment?.title, window: run.report.experiment?.window, metric: run.report.experiment?.metric },
      engineDurationMs: run.report.provenance?.engineDurationMs || 0
    }));
}

// Keeps the newest `keep` runs; deletes older records, their artifacts, and the
// unpushed local branches failed implementation runs left for inspection.
export async function pruneRuns({ keep = 30, deleteBranch = async () => {} } = {}) {
  let names;
  try { names = await readdir(storeDir); } catch { return []; }
  const runs = [];
  for (const name of names.filter(entry => entry.endsWith('.json'))) {
    try { runs.push(JSON.parse(await readFile(join(storeDir, name), 'utf8'))); } catch { /* Skip unreadable records. */ }
  }
  const stale = runs.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(keep);
  for (const run of stale) {
    const branch = run.execution?.failure?.localBranch;
    if (branch) await deleteBranch(branch).catch(() => {});
    await rm(runArtifactsDir(run.id), { recursive: true, force: true });
    await rm(filepath(run.id), { force: true });
  }
  return stale.map(run => run.id);
}
