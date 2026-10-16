import { cp, mkdir, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const template = resolve(root, 'demo/target-template');
const target = resolve(root, '.context/signal-demo-target');
const remote = resolve(root, '.context/signal-demo-remote.git');

async function exists(path) {
  try { await stat(path); return true; } catch (error) { if (error?.code === 'ENOENT') return false; throw error; }
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || `${command} failed`).trim());
}

if (await exists(target) || await exists(remote)) {
  throw new Error('The demo target already exists in .context. Move or remove it explicitly before creating a new one.');
}

await mkdir(resolve(root, '.context'), { recursive: true });
await cp(template, target, { recursive: true });
run('git', ['init', '--bare', '--initial-branch=main', remote], root);
run('git', ['init', '--initial-branch=main'], target);
run('git', ['config', 'user.name', 'Signal Demo'], target);
run('git', ['config', 'user.email', 'signal-demo@example.invalid'], target);
run('git', ['add', '-A'], target);
run('git', ['commit', '-m', 'chore: seed workflow recorder'], target);
run('git', ['remote', 'add', 'origin', remote], target);
run('git', ['push', '-u', 'origin', 'main'], target);

console.log('Created an isolated Signal demo repository.');
console.log(`SIGNAL_EXECUTION_REPO=${target}`);
console.log('SIGNAL_EXECUTION_BASE=main');
console.log('SIGNAL_EXECUTION_REMOTE=origin');
console.log('Note: this local bare remote proves branch, commit, diff, tests, and build. A GitHub remote is still required to prove gh pr create.');
