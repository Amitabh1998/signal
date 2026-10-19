import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Works out how to install dependencies and run the quality gates in a fresh
// worktree, from the lockfile the repository commits. SIGNAL_EXECUTION_SETUP
// overrides the install command ("none" skips it).
const managers = [
  { lockfile: 'pnpm-lock.yaml', manager: 'pnpm', install: ['install', '--frozen-lockfile'] },
  { lockfile: 'bun.lockb', manager: 'bun', install: ['install', '--frozen-lockfile'] },
  { lockfile: 'bun.lock', manager: 'bun', install: ['install', '--frozen-lockfile'] },
  { lockfile: 'npm-shrinkwrap.json', manager: 'npm', install: ['ci', '--no-audit', '--no-fund'] },
  { lockfile: 'package-lock.json', manager: 'npm', install: ['ci', '--no-audit', '--no-fund'] }
];

function readPackage(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
}

function yarnInstall(dir) {
  // Yarn Berry (with .yarnrc.yml) renamed --frozen-lockfile to --immutable.
  return existsSync(join(dir, '.yarnrc.yml')) ? ['install', '--immutable'] : ['install', '--frozen-lockfile'];
}

export function detectRepoSetup(dir, override = process.env.SIGNAL_EXECUTION_SETUP) {
  const pkg = readPackage(dir);
  const scripts = pkg?.scripts || {};
  const found = existsSync(join(dir, 'yarn.lock'))
    ? { lockfile: 'yarn.lock', manager: 'yarn', install: yarnInstall(dir) }
    : managers.find(entry => existsSync(join(dir, entry.lockfile)));
  const manager = found?.manager || 'npm';
  const hasDependencies = Boolean(pkg && Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies }).length);

  let install = null;
  if (override && override.trim().toLowerCase() === 'none') install = null;
  else if (override && override.trim()) install = { command: 'sh', args: ['-c', override.trim()], label: override.trim(), source: 'SIGNAL_EXECUTION_SETUP' };
  else if (found) install = { command: found.manager, args: found.install, label: `${found.manager} ${found.install.join(' ')}`, source: found.lockfile };
  // Without a lockfile, installing is not reproducible; do it only when there is something to install.
  else if (hasDependencies) install = { command: 'npm', args: ['install', '--no-audit', '--no-fund'], label: 'npm install --no-audit --no-fund', source: 'package.json (no lockfile)' };

  const gate = (name, script) => scripts[script]
    ? { name, command: manager, args: manager === 'npm' && script === 'test' ? ['test'] : ['run', script] }
    : null;
  return {
    manager,
    install,
    gates: [
      gate(manager === 'npm' ? 'npm test' : `${manager} test`, 'test') || { name: `${manager} test`, missing: 'The repository has no test script.' },
      gate(`${manager} run build`, 'build') || { name: `${manager} run build`, missing: 'The repository has no build script.' }
    ],
    // Shell patterns the coding agent may run to check its own work.
    agentCommands: [`${manager} test:*`, `${manager} run test:*`, `${manager} run build:*`]
  };
}
