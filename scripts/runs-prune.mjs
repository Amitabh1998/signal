import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pruneRuns } from './run-store.mjs';

// npm run runs:prune [-- --keep 30]: delete old run records, their artifacts,
// and the unpushed branches failed runs kept in the trusted repository.
async function loadDotEnv(filepath) {
  try {
    for (const line of (await readFile(filepath, 'utf8')).split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

await loadDotEnv(resolve('.env'));
const keepIndex = process.argv.indexOf('--keep');
const keep = keepIndex > 0 ? Number(process.argv[keepIndex + 1]) : Number(process.env.SIGNAL_RUNS_KEEP) || 30;
const repo = process.env.SIGNAL_EXECUTION_REPO;
const removed = await pruneRuns({
  keep,
  deleteBranch: async branch => {
    if (repo && /^signal\//.test(branch)) execFileSync('git', ['-C', repo, 'branch', '-D', branch], { stdio: 'ignore' });
  }
});
console.log(`Pruned ${removed.length} run(s); kept the newest ${keep}.`);
