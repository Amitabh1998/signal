import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', env: executionEnv, ...options });
  if (result.status !== 0) {
    // Keep the tail: CLIs echo their input first and print the actual failure last.
    const output = (result.stderr || result.stdout || `${command} failed`).trim();
    throw new Error(output.slice(-6000));
  }
  return result.stdout.trim();
}

function packageScripts(repo) {
  try {
    return JSON.parse(run('node', ['-e', 'process.stdout.write(require("./package.json").scripts ? JSON.stringify(require("./package.json").scripts) : "{}")'], { cwd: repo }));
  } catch {
    return {};
  }
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

const branch = `signal/${runId}`;
const worktree = await mkdtemp(join(tmpdir(), 'signal-worktree-'));
const artifactsDir = await mkdtemp(join(tmpdir(), 'signal-artifacts-'));
const summaryPath = join(artifactsDir, 'coding-agent-summary.md');
let deliveryReview;
let pushed = false;
const qualityGates = [];

try {
  emit('preflight', `Preparing ${basename(repo)} on ${remote}/${base} as ${branch}`);
  run('git', ['-C', repo, 'rev-parse', '--is-inside-work-tree']);
  run('git', ['-C', repo, 'remote', 'get-url', remote]);
  run('git', ['-C', repo, 'fetch', remote, base]);
  run('git', ['-C', repo, 'worktree', 'add', '-b', branch, worktree, `${remote}/${base}`]);

  const prompt = `You are implementing a bounded Signal build mission for ${basename(repo)} in the isolated worktree ${worktree}. Edit files only inside that worktree.

Mission title: ${title}
Mission brief:
${brief}

Approved scope decision:
${JSON.stringify(approvedDecision, null, 2)}

Work carefully in the current repository. First inspect its conventions and existing tests. Implement only the scoped change. Run the existing relevant tests and build. Do not create commits, push branches, or open pull requests: Signal handles those after the quality gates. In your final response, summarize changed files, tests run, and remaining risks.`;

  if (runner === 'codex') {
    emit('implementing', 'Dispatching the mission to Codex CLI');
    run('codex', ['exec', '-C', worktree, '-s', 'workspace-write', '--ephemeral', '-o', summaryPath, prompt], { cwd: worktree, maxBuffer: 10_000_000 });
  } else {
    emit('implementing', 'Dispatching the mission to Claude Code');
    // Edits are auto-accepted inside the worktree; shell access is limited to the quality gates and read-only git.
    const output = run('claude', [
      '-p', prompt,
      '--permission-mode', 'acceptEdits',
      '--allowedTools', 'Bash(npm test)', 'Bash(npm run build)', 'Bash(git status:*)', 'Bash(git diff:*)',
      '--output-format', 'json',
      '--no-session-persistence'
    ], { cwd: worktree, input: '', maxBuffer: 10_000_000 });
    const result = JSON.parse(output);
    if (result.is_error) throw new Error(`Claude Code stopped: ${result.subtype || 'error'} ${String(result.result || '').slice(-2000)}`.trim());
    await writeFile(summaryPath, String(result.result || ''), 'utf8');
  }

  const scripts = packageScripts(worktree);
  if (scripts.test) {
    emit('testing', 'Running npm test');
    const output = run('npm', ['test'], { cwd: worktree, maxBuffer: 10_000_000 });
    qualityGates.push({ name: 'npm test', status: 'passed', output: output.slice(-12_000) });
  } else {
    qualityGates.push({ name: 'npm test', status: 'not-configured', output: 'The repository has no npm test script.' });
  }
  if (scripts.build) {
    emit('testing', 'Running npm run build');
    const output = run('npm', ['run', 'build'], { cwd: worktree, maxBuffer: 10_000_000 });
    qualityGates.push({ name: 'npm run build', status: 'passed', output: output.slice(-12_000) });
  } else {
    qualityGates.push({ name: 'npm run build', status: 'not-configured', output: 'The repository has no npm run build script.' });
  }

  const changed = run('git', ['status', '--short'], { cwd: worktree });
  if (!changed) throw new Error('The coding agent completed without changing tracked files. No pull request was created.');
  const agentSummary = await readFile(summaryPath, 'utf8').catch(() => 'No agent summary was written.');
  // Commit locally first so the review reads one immutable commit; nothing
  // reaches the remote until that review has run.
  emit('testing', 'Committing the tested change locally for review');
  run('git', ['add', '-A'], { cwd: worktree });
  run('git', ['commit', '-m', `feat: ${title}`], { cwd: worktree, maxBuffer: 10_000_000 });
  const head = run('git', ['rev-parse', 'HEAD'], { cwd: worktree });
  const baseCommit = run('git', ['rev-parse', 'HEAD~1'], { cwd: worktree });

  if (deliveryReviewEnabled) {
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
      changedFiles: run('git', ['diff', '--name-status', baseCommit, head], { cwd: worktree }),
      qualityGates,
      constraints: 'This is a delivery assessment for human pull-request review. It must never automatically approve a release.'
    };
    await writeFile(deliveryInputPath, `${JSON.stringify(deliveryBundle, null, 2)}\n`, 'utf8');
    try {
      emit('delivery-review', `RocketRide's diff reader agent is reading commit ${head.slice(0, 7)} with read-only git tools`);
      run(process.execPath, [
        join(signalRoot, 'scripts/rocketride-delivery-review.mjs'),
        '--input', deliveryInputPath,
        '--output', deliveryOutputPath
      ], { cwd: signalRoot, maxBuffer: 10_000_000 });
      deliveryReview = JSON.parse(await readFile(deliveryOutputPath, 'utf8'));
      emit('delivery-review', `RocketRide delivery review: ${deliveryReview.verdict}`, { deliveryReview });
    } catch (error) {
      const lines = error instanceof Error ? error.message.split('\n').map(line => line.trim()).filter(Boolean) : [String(error)];
      const detail = lines.findLast(line => /error/i.test(line) && !line.startsWith('at ')) || lines.at(-1);
      emit('delivery-review-failed', `RocketRide did not produce a delivery review: ${detail}`);
      if (deliveryReviewRequired) throw new Error(`A required RocketRide delivery review failed. Nothing was pushed. ${detail}`);
    }
  }

  emit('review-ready', `Pushing reviewed commit ${head.slice(0, 7)}`);
  run('git', ['push', '-u', remote, branch], { cwd: worktree, maxBuffer: 10_000_000 });
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
    const prUrl = run('gh', ['pr', 'create', '--base', base, '--head', branch, '--title', title, '--body-file', bodyPath], { cwd: worktree, maxBuffer: 10_000_000 });
    emit('complete', prUrl, { reviewBranch: `${remote}/${branch}` });
  }
} finally {
  try { run('git', ['-C', repo, 'worktree', 'remove', '--force', worktree]); } catch { await rm(worktree, { recursive: true, force: true }); }
  // A branch that never reached the remote holds nothing reviewable.
  if (!pushed) { try { run('git', ['-C', repo, 'branch', '-D', branch]); } catch { /* It may not have been created. */ } }
  await rm(artifactsDir, { recursive: true, force: true });
}
