import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectRepoSetup } from './repo-setup.mjs';

const signalRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const executionEnv = { ...process.env };

// Conductor can inject a read-only temporary token. Let git and gh use the
// authenticated local account selected by the person running the factory.
delete executionEnv.GH_TOKEN;
delete executionEnv.GITHUB_TOKEN;
// When Signal itself runs inside a Claude Code session, the inherited session
// variables would make the coding runner act as a child of that session.
for (const key of Object.keys(executionEnv)) {
  if (key === 'CLAUDECODE' || key.startsWith('CLAUDE_CODE_') || key === 'CLAUDE_PID') delete executionEnv[key];
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith('--')) args[token.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[++index] : true;
  }
  return args;
}

function emit(phase, detail, extra = {}) {
  process.stdout.write(`${JSON.stringify({ type: 'signal-execution', phase, detail, ...extra, at: new Date().toISOString() })}\n`);
}

// Seconds per stage; each can be overridden with SIGNAL_TIMEOUT_<STAGE>.
const timeouts = {
  setup: Number(process.env.SIGNAL_TIMEOUT_SETUP) || 600,
  agent: Number(process.env.SIGNAL_TIMEOUT_AGENT) || 1500,
  gates: Number(process.env.SIGNAL_TIMEOUT_GATES) || 600,
  review: Number(process.env.SIGNAL_TIMEOUT_REVIEW) || 360,
  git: 120
};

class StageError extends Error {
  constructor(code, stage, message) {
    super(message);
    this.code = code;
    this.stage = stage;
  }
}

// Every command runs in its own process group so a timeout or cancellation
// stops the whole tree (npm → node, claude → its tools), not just the parent.
const activeGroups = new Set();
let cancelled = false;
let currentStage = 'preflight';

function killGroup(pid) {
  try { process.kill(-pid, 'SIGTERM'); } catch { /* Already gone. */ }
  setTimeout(() => { try { process.kill(-pid, 'SIGKILL'); } catch { /* Already gone. */ } }, 5000).unref();
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    cancelled = true;
    for (const pid of activeGroups) killGroup(pid);
  });
}

let logsDir;

function exec(command, commandArgs, { cwd, input = '', timeout = timeouts.git, log = currentStage, stage = currentStage, allowCancelled = false } = {}) {
  if (cancelled && !allowCancelled) return Promise.reject(new StageError('cancelled', stage, 'The run was cancelled.'));
  return new Promise((resolvePromise, reject) => {
    const logStream = createWriteStream(join(logsDir, `${log}.log`), { flags: 'a' });
    logStream.write(`\n$ ${[command, ...commandArgs].map(part => (part.length > 160 ? `${part.slice(0, 157)}…` : part)).join(' ')}\n`);
    const child = spawn(command, commandArgs, { cwd, env: executionEnv, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
    if (child.pid) activeGroups.add(child.pid);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout = `${stdout}${chunk}`.slice(-10_000_000); logStream.write(chunk); });
    child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-10_000_000); logStream.write(chunk); });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; killGroup(child.pid); }, timeout * 1000);
    const finish = () => { clearTimeout(timer); activeGroups.delete(child.pid); logStream.end(); };
    child.on('error', error => {
      finish();
      reject(new StageError('command-failed', stage, `${command} could not start: ${error.message}`));
    });
    child.on('close', code => {
      finish();
      if (cancelled && !allowCancelled) return reject(new StageError('cancelled', stage, 'The run was cancelled.'));
      if (timedOut) return reject(new StageError('stage-timeout', stage, `${stage} exceeded ${timeout}s and was stopped.`));
      // Keep the tail: CLIs echo their input first and print the actual failure last.
      if (code !== 0) return reject(new StageError('command-failed', stage, (stderr.trim() || stdout.trim() || `${command} exited with ${code}`).slice(-6000)));
      resolvePromise(stdout.trim());
    });
    child.stdin.end(input);
  });
}

const git = (cwd, ...gitArgs) => exec('git', gitArgs, { cwd, log: 'git' });
// Cleanup git commands still run after a cancellation.
const cleanupGit = (cwd, ...gitArgs) => exec('git', gitArgs, { cwd, log: 'git', allowCancelled: true });

// Commit as the repository's configured identity; fall back to Signal's only
// when none is configured, so a commit never fails for lack of a name.
async function identityArgs(cwd) {
  const email = await cleanupGit(cwd, 'config', 'user.email').catch(() => '');
  return email ? [] : ['-c', 'user.name=Signal', '-c', 'user.email=signal@localhost'];
}

function lastErrorLine(message) {
  const lines = String(message).split('\n').map(line => line.trim()).filter(Boolean);
  return lines.findLast(line => /error/i.test(line) && !line.startsWith('at ')) || lines.at(-1) || 'Unknown error';
}

const args = parseArgs(process.argv.slice(2));
if (process.env.SIGNAL_EXECUTION_ENABLED !== '1') throw new Error('Signal execution is disabled. Set SIGNAL_EXECUTION_ENABLED=1 only for an explicitly trusted repository.');

const inputPath = resolve(String(args.input || ''));
const repo = resolve(String(args.repo || process.env.SIGNAL_EXECUTION_REPO || ''));
const base = String(args.base || process.env.SIGNAL_EXECUTION_BASE || 'main');
const remote = String(args.remote || process.env.SIGNAL_EXECUTION_REMOTE || 'origin');
const runId = String(args.id || Date.now()).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 30);
const deliveryReviewEnabled = process.env.SIGNAL_DELIVERY_REVIEW_ENABLED === '1';
const deliveryReviewRequired = process.env.SIGNAL_DELIVERY_REVIEW_REQUIRED === '1';
const prMode = process.env.SIGNAL_EXECUTION_PR_MODE === 'local' ? 'local' : 'github';
const runner = process.env.SIGNAL_EXECUTION_RUNNER === 'codex' ? 'codex' : 'claude';
const agentBudget = Number(process.env.SIGNAL_AGENT_BUDGET_USD) || 2;
if (!inputPath || !repo) throw new Error('An execution input and trusted repository are required.');

const mission = JSON.parse(await readFile(inputPath, 'utf8'));
const title = String(mission.title || 'Signal mission').replace(/[\r\n]/g, ' ').slice(0, 72);
const brief = String(mission.brief || '').trim();
if (!brief) throw new Error('The mission brief is empty.');
const acceptanceCriteria = Array.isArray(mission.acceptanceCriteria)
  ? mission.acceptanceCriteria.map(String).filter(Boolean).slice(0, 20)
  : [];
const approvedDecision = {
  scopeReportId: mission.scopeReportId,
  recommendation: mission.recommendation,
  contradiction: mission.contradiction,
  experiment: mission.experiment,
  acceptanceCriteria,
  evidence: Array.isArray(mission.evidence) ? mission.evidence.slice(0, 20) : []
};

// The run folder outlives the run: inputs, logs, patch, and review stay for inspection.
const artifactsDir = resolve(String(args.artifacts || await mkdtemp(join(tmpdir(), 'signal-artifacts-'))));
logsDir = join(artifactsDir, 'logs');
await mkdir(logsDir, { recursive: true });
await writeFile(join(artifactsDir, 'mission.json'), `${JSON.stringify(mission, null, 2)}\n`, 'utf8');

const branch = `signal/${runId}`;
const worktree = await mkdtemp(join(tmpdir(), 'signal-worktree-'));
const summaryPath = join(artifactsDir, 'coding-agent-summary.md');
let deliveryReview;
let pushed = false;
let worktreeReady = false;
const qualityGates = [];

async function runDeliveryReview(deliveryInputPath, deliveryOutputPath) {
  // One retry: engine disconnects and malformed extractor output are transient.
  for (let attempt = 1; ; attempt += 1) {
    try {
      await exec(process.execPath, [join(signalRoot, 'scripts/rocketride-delivery-review.mjs'), '--input', deliveryInputPath, '--output', deliveryOutputPath], { cwd: signalRoot, timeout: timeouts.review, log: `delivery-review-${attempt}` });
      return { review: JSON.parse(await readFile(deliveryOutputPath, 'utf8')), attempts: attempt };
    } catch (error) {
      if (attempt === 2 || error.code === 'cancelled') throw error;
      emit('delivery-review', `Delivery review attempt 1 failed (${lastErrorLine(error.message)}); retrying once`);
    }
  }
}

// Keep the work of a failed run: commit anything uncommitted to the local
// branch (never pushed) and save the patch next to the logs.
async function preserveFailedWork() {
  if (!worktreeReady) return null;
  try {
    if (await cleanupGit(worktree, 'status', '--porcelain')) {
      await cleanupGit(worktree, 'add', '-A');
      await cleanupGit(worktree, ...await identityArgs(worktree), 'commit', '--no-verify', '-m', `wip: Signal run ${runId} stopped during ${currentStage} (not pushed)`);
    }
    const patch = await cleanupGit(worktree, 'diff', '--no-ext-diff', `${remote}/${base}`, 'HEAD');
    if (!patch) return null;
    await writeFile(join(artifactsDir, 'patch.diff'), `${patch}\n`, 'utf8');
    return branch;
  } catch {
    return null;
  }
}

let failure;
try {
  emit('preflight', `Preparing ${basename(repo)} on ${remote}/${base} as ${branch}`);
  await git(repo, 'rev-parse', '--is-inside-work-tree');
  await git(repo, 'remote', 'get-url', remote);
  await git(repo, 'fetch', remote, base);
  await git(repo, 'worktree', 'add', '-b', branch, worktree, `${remote}/${base}`);
  worktreeReady = true;

  // A fresh worktree has no dependencies; install them from the lockfile so
  // the coding agent and the quality gates run against a real environment.
  const setup = detectRepoSetup(worktree);
  if (setup.install) {
    currentStage = 'setup';
    emit('setup', `Installing dependencies: ${setup.install.label}`);
    const output = await exec(setup.install.command, setup.install.args, { cwd: worktree, timeout: timeouts.setup, log: 'setup' });
    qualityGates.push({ name: `setup (${setup.install.label})`, status: 'passed', output: output.slice(-4000) });
  }

  const prompt = `You are implementing a bounded Signal build mission for ${basename(repo)} in the isolated worktree ${worktree}. Edit files only inside that worktree.

Mission title: ${title}
Mission brief:
${brief}

Approved scope decision:
${JSON.stringify(approvedDecision, null, 2)}

Work carefully in the current repository. First inspect its conventions and existing tests. Implement only the scoped change. Run the existing relevant tests and build. Do not create commits, push branches, or open pull requests: Signal handles those after the quality gates. In your final response, summarize changed files, tests run, and remaining risks.`;

  currentStage = 'implementing';
  if (runner === 'codex') {
    emit('implementing', 'Dispatching the mission to Codex CLI');
    await exec('codex', ['exec', '-C', worktree, '-s', 'workspace-write', '--ephemeral', '-o', summaryPath, prompt], { cwd: worktree, timeout: timeouts.agent, log: 'agent' });
  } else {
    emit('implementing', `Dispatching the mission to Claude Code (budget $${agentBudget})`);
    // Isolated from the operator's own setup: no user-level settings, hooks, or
    // MCP servers. Edits are auto-accepted inside the worktree; shell access is
    // limited to the repository's quality gates and read-only git.
    const output = await exec('claude', [
      '-p', prompt,
      '--permission-mode', 'acceptEdits',
      '--allowedTools', ...setup.agentCommands.map(pattern => `Bash(${pattern})`), 'Bash(git status:*)', 'Bash(git diff:*)', 'Bash(git log:*)',
      '--strict-mcp-config',
      '--setting-sources', 'project,local',
      '--max-budget-usd', String(agentBudget),
      ...(process.env.SIGNAL_AGENT_MODEL ? ['--model', process.env.SIGNAL_AGENT_MODEL] : []),
      '--output-format', 'json',
      '--no-session-persistence'
    ], { cwd: worktree, timeout: timeouts.agent, log: 'agent' });
    const result = JSON.parse(output);
    await writeFile(summaryPath, String(result.result || ''), 'utf8');
    if (result.is_error) {
      const code = /budget/i.test(result.subtype || '') ? 'agent-budget' : 'agent-failed';
      throw new StageError(code, 'implementing', `Claude Code stopped: ${result.subtype || 'error'} ${String(result.result || '').slice(-2000)}`.trim());
    }
  }

  currentStage = 'testing';
  for (const gate of setup.gates) {
    if (gate.missing) {
      qualityGates.push({ name: gate.name, status: 'not-configured', output: gate.missing });
      continue;
    }
    emit('testing', `Running ${gate.name}`);
    const output = await exec(gate.command, gate.args, { cwd: worktree, timeout: timeouts.gates, log: 'gates' });
    qualityGates.push({ name: gate.name, status: 'passed', output: output.slice(-12_000) });
  }

  const changed = await git(worktree, 'status', '--short');
  if (!changed) throw new StageError('no-changes', 'implementing', 'The coding agent completed without changing tracked files. Nothing was pushed.');
  const agentSummary = await readFile(summaryPath, 'utf8').catch(() => 'No agent summary was written.');
  // Commit locally first so the review reads one immutable commit; nothing
  // reaches the remote until that review has run.
  emit('testing', 'Committing the tested change locally for review');
  await git(worktree, 'add', '-A');
  await git(worktree, ...await identityArgs(worktree), 'commit', '-m', `feat: ${title}`);
  const head = await git(worktree, 'rev-parse', 'HEAD');
  const baseCommit = await git(worktree, 'rev-parse', 'HEAD~1');
  await writeFile(join(artifactsDir, 'patch.diff'), `${await git(worktree, 'diff', '--no-ext-diff', baseCommit, head)}\n`, 'utf8');

  if (deliveryReviewEnabled) {
    currentStage = 'delivery-review';
    const deliveryInputPath = join(artifactsDir, 'delivery-input.json');
    const deliveryOutputPath = join(artifactsDir, 'delivery-review.json');
    const deliveryBundle = {
      schemaVersion: 1,
      mission: { title, brief },
      repository: basename(repo),
      branch,
      repoPath: worktree,
      commitRange: { base: baseCommit, head },
      codingAgentSummary: agentSummary,
      changedFiles: await git(worktree, 'diff', '--name-status', baseCommit, head),
      qualityGates,
      constraints: 'This is a delivery assessment for human pull-request review. It must never automatically approve a release.'
    };
    await writeFile(deliveryInputPath, `${JSON.stringify(deliveryBundle, null, 2)}\n`, 'utf8');
    try {
      emit('delivery-review', `RocketRide's diff reader agent is reading commit ${head.slice(0, 7)} with read-only git tools`);
      const outcome = await runDeliveryReview(deliveryInputPath, deliveryOutputPath);
      deliveryReview = { ...outcome.review, attempts: outcome.attempts };
      emit('delivery-review', `RocketRide delivery review: ${deliveryReview.verdict}`, { deliveryReview });
    } catch (error) {
      if (error.code === 'cancelled') throw error;
      const detail = lastErrorLine(error.message);
      emit('delivery-review-failed', `RocketRide did not produce a delivery review: ${detail}`);
      if (deliveryReviewRequired) throw new StageError('review-failed', 'delivery-review', `A required RocketRide delivery review failed. Nothing was pushed. ${detail}`);
    }
  }

  currentStage = 'opening-pr';
  emit('review-ready', `Pushing reviewed commit ${head.slice(0, 7)}`);
  await git(worktree, 'push', '-u', remote, branch);
  pushed = true;

  const bodyPath = join(artifactsDir, 'pull-request-body.md');
  const deliveryReviewSection = deliveryReview
    ? `## RocketRide delivery review\n\n**Verdict:** ${deliveryReview.verdict} (ready means ready for human PR review, never automatic release)\n\n${deliveryReview.summary}\n\n${deliveryReview.checks.map(check => `- [${check.status === 'passed' ? 'x' : ' '}] ${check.name}: ${check.detail}`).join('\n')}\n\n${deliveryReview.risks.length ? `### Risks\n\n${deliveryReview.risks.map(risk => `- **${risk.severity}:** ${risk.title} — ${risk.detail}`).join('\n')}\n` : ''}`
    : `## RocketRide delivery review\n\nNo live delivery review was attached. ${deliveryReviewEnabled ? 'The optional workflow did not produce a result; inspect the execution logs.' : 'It was not enabled for this execution.'}\n`;
  const gateChecklist = qualityGates.map(gate => `- [${gate.status === 'passed' ? 'x' : ' '}] ${gate.name}: ${gate.status}`).join('\n');
  await writeFile(bodyPath, `## Signal build mission\n\n${brief}\n\n## Approved decision\n\n**Recommendation:** ${mission.recommendation?.title || 'Not provided'}\n\n### Acceptance criteria\n\n${acceptanceCriteria.map(item => `- ${item}`).join('\n') || '- Review the mission brief and implementation manually.'}\n\n## Coding-agent summary\n\n${agentSummary}\n\n## Quality gates\n\n${gateChecklist}\n- [ ] Human review\n\n${deliveryReviewSection}`, 'utf8');
  if (prMode === 'local') {
    emit('complete', `Local review branch pushed: ${remote}/${branch}`, { reviewBranch: `${remote}/${branch}` });
  } else {
    emit('opening-pr', 'Opening a pull request for human review');
    const prUrl = await exec('gh', ['pr', 'create', '--base', base, '--head', branch, '--title', title, '--body-file', bodyPath], { cwd: worktree, log: 'git' });
    emit('complete', prUrl, { reviewBranch: `${remote}/${branch}` });
  }
} catch (error) {
  failure = {
    code: error.code || 'internal-error',
    stage: error.stage || currentStage,
    message: lastErrorLine(error.message),
    localBranch: pushed ? null : await preserveFailedWork(),
    artifacts: artifactsDir
  };
  emit('failed', failure.message, { failure });
  process.exitCode = failure.code === 'cancelled' ? 130 : 1;
} finally {
  try { await cleanupGit(repo, 'worktree', 'remove', '--force', worktree); } catch { await rm(worktree, { recursive: true, force: true }); }
  // An unpushed branch survives only when it holds the failed run's work.
  if (!pushed && !failure?.localBranch) {
    try { await cleanupGit(repo, 'branch', '-D', branch); } catch { /* It may not have been created. */ }
  }
}
