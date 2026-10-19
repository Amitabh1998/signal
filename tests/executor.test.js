import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { detectRepoSetup } from '../scripts/repo-setup.mjs';

const executor = new URL('../scripts/signal-execute.mjs', import.meta.url).pathname;
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

// A trusted repository with a bare remote, plus fake `claude` and `gh` CLIs.
async function fixture({ testScript = 'node -e "process.exit(0)"', lockfile = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'signal-exec-test-'));
  const remote = join(root, 'remote.git');
  const repo = join(root, 'repo');
  const bin = join(root, 'bin');
  await mkdir(repo);
  await mkdir(bin);
  git(root, 'init', '-q', '--bare', '-b', 'main', remote);
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 'test@example.invalid');
  git(repo, 'config', 'user.name', 'Test');
  await writeFile(join(repo, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0', private: true, scripts: { test: testScript } }, null, 2));
  if (lockfile) await writeFile(join(repo, 'package-lock.json'), JSON.stringify({ name: 'fixture', version: '1.0.0', lockfileVersion: 3, requires: true, packages: { '': { name: 'fixture', version: '1.0.0' } } }, null, 2));
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'init');
  git(repo, 'remote', 'add', 'origin', remote);
  git(repo, 'push', '-q', 'origin', 'main');

  await writeFile(join(bin, 'claude'), `#!/usr/bin/env node
const fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(join(root, 'agent.pid'))}, String(process.pid));
if (process.env.FAKE_AGENT === 'sleep') setTimeout(() => {}, 120000);
else {
  fs.writeFileSync('feature.txt', 'implemented\\n');
  process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'Added feature.txt' }));
}
`);
  await writeFile(join(bin, 'gh'), `#!/usr/bin/env node
require('node:fs').writeFileSync(${JSON.stringify(join(root, 'gh-args.json'))}, JSON.stringify(process.argv.slice(2)));
process.stdout.write('https://github.com/example/fixture/pull/7\\n');
`);
  await chmod(join(bin, 'claude'), 0o755);
  await chmod(join(bin, 'gh'), 0o755);
  const mission = join(root, 'mission.json');
  await writeFile(mission, JSON.stringify({ title: 'Add feature file', brief: 'Create feature.txt.', acceptanceCriteria: ['feature.txt exists'] }));
  return { root, remote, repo, bin, mission, artifacts: join(root, 'artifacts') };
}

function runExecutor(fx, { id, env = {}, onStart } = {}) {
  return new Promise(resolvePromise => {
    const child = spawn(process.execPath, [executor, '--input', fx.mission, '--id', id, '--artifacts', fx.artifacts], {
      env: {
        ...process.env,
        PATH: `${fx.bin}:${process.env.PATH}`,
        SIGNAL_EXECUTION_ENABLED: '1',
        SIGNAL_EXECUTION_REPO: fx.repo,
        SIGNAL_EXECUTION_PR_MODE: 'github',
        SIGNAL_EXECUTION_RUNNER: 'claude',
        SIGNAL_DELIVERY_REVIEW_ENABLED: '0',
        ...env
      }
    });
    let stdout = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    onStart?.(child);
    child.on('close', code => {
      const events = stdout.split('\n').filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
      resolvePromise({ code, events, failure: events.find(event => event.phase === 'failed')?.failure });
    });
  });
}

const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
// Process exit after SIGTERM is asynchronous; poll instead of checking once.
const stopped = async pid => {
  for (let tries = 0; tries < 50 && alive(pid); tries += 1) await new Promise(resolveWait => setTimeout(resolveWait, 100));
  return !alive(pid);
};
const agentPid = async fx => Number(await readFile(join(fx.root, 'agent.pid'), 'utf8').catch(() => '0'));

test('repository setup is chosen from the committed lockfile', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'signal-setup-'));
  const write = (name, body = '{}') => writeFile(join(dir, name), body);
  await write('package.json', JSON.stringify({ scripts: { test: 'x', build: 'y' }, devDependencies: { a: '1' } }));
  assert.equal(detectRepoSetup(dir, '').install.label, 'npm install --no-audit --no-fund');
  await write('package-lock.json');
  const npm = detectRepoSetup(dir, '');
  assert.equal(npm.install.label, 'npm ci --no-audit --no-fund');
  assert.deepEqual(npm.gates.map(gate => gate.name), ['npm test', 'npm run build']);
  await write('yarn.lock', '');
  await write('.yarnrc.yml', '');
  assert.equal(detectRepoSetup(dir, '').install.label, 'yarn install --immutable');
  assert.equal(detectRepoSetup(dir, 'none').install, null);
  assert.equal(detectRepoSetup(dir, 'make deps').install.label, 'make deps');
});

test('a passing run installs dependencies, pushes, and opens the PR with gh', async () => {
  const fx = await fixture();
  const result = await runExecutor(fx, { id: 'test-pass' });
  assert.equal(result.code, 0, JSON.stringify(result.failure));
  assert.ok(result.events.some(event => event.phase === 'setup' && /npm ci/.test(event.detail)));
  assert.equal(result.events.at(-1).detail, 'https://github.com/example/fixture/pull/7');
  const ghArgs = JSON.parse(await readFile(join(fx.root, 'gh-args.json'), 'utf8'));
  assert.deepEqual(ghArgs.slice(0, 8), ['pr', 'create', '--base', 'main', '--head', 'signal/test-pass', '--title', 'Add feature file']);
  assert.match(await readFile(ghArgs[9], 'utf8'), /## Quality gates[\s\S]*\[x\] npm test: passed/);
  assert.match(git(fx.remote, 'show', 'signal/test-pass:feature.txt'), /implemented/);
  assert.match(await readFile(join(fx.artifacts, 'patch.diff'), 'utf8'), /\+implemented/);
});

test('a failing run keeps its work on an unpushed local branch with the patch', async () => {
  const fx = await fixture({ testScript: 'node -e "process.exit(1)"' });
  const result = await runExecutor(fx, { id: 'test-fail' });
  assert.equal(result.code, 1);
  assert.equal(result.failure.stage, 'testing');
  assert.equal(result.failure.code, 'command-failed');
  assert.equal(result.failure.localBranch, 'signal/test-fail');
  assert.match(git(fx.repo, 'show', 'signal/test-fail:feature.txt'), /implemented/);
  assert.match(git(fx.repo, 'log', '-1', '--format=%s', 'signal/test-fail'), /^wip: Signal run test-fail stopped during testing/);
  assert.throws(() => git(fx.remote, 'rev-parse', '--verify', 'signal/test-fail'));
  assert.ok(existsSync(join(fx.artifacts, 'patch.diff')));
  assert.ok(existsSync(join(fx.artifacts, 'logs', 'gates.log')));
});

test('a hung coding agent is stopped at its stage timeout', async () => {
  const fx = await fixture();
  const result = await runExecutor(fx, { id: 'test-timeout', env: { FAKE_AGENT: 'sleep', SIGNAL_TIMEOUT_AGENT: '4' } });
  assert.equal(result.failure.code, 'stage-timeout');
  assert.equal(result.failure.stage, 'implementing');
  const pid = await agentPid(fx);
  assert.ok(!pid || await stopped(pid), 'the hung agent should be stopped');
  // Nothing was produced, so no branch is kept.
  assert.equal(result.failure.localBranch, null);
  assert.throws(() => git(fx.repo, 'rev-parse', '--verify', 'signal/test-timeout'));
});

test('cancelling a run stops its process tree', async () => {
  const fx = await fixture();
  const result = await runExecutor(fx, {
    id: 'test-cancel',
    env: { FAKE_AGENT: 'sleep' },
    onStart: child => {
      const waitForAgent = setInterval(() => {
        if (existsSync(join(fx.root, 'agent.pid'))) {
          clearInterval(waitForAgent);
          child.kill('SIGTERM');
        }
      }, 100);
    }
  });
  assert.equal(result.code, 130);
  assert.equal(result.failure.code, 'cancelled');
  assert.ok(await stopped(await agentPid(fx)), 'the agent should be stopped');
});
