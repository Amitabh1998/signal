import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const signalRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith('--')) args[token.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[++index] : true;
  }
  return args;
}

function emit(phase, detail) {
  process.stdout.write(`${JSON.stringify({ type: 'signal-execution', phase, detail, at: new Date().toISOString() })}\n`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) {
    const output = (result.stderr || result.stdout || `${command} failed`).trim();
    throw new Error(output.slice(0, 6000));
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
if (!inputPath || !repo) throw new Error('An execution input and trusted repository are required.');

const mission = JSON.parse(await readFile(inputPath, 'utf8'));
const title = String(mission.title || 'Signal mission').replace(/[\r\n]/g, ' ').slice(0, 72);
const brief = String(mission.brief || '').trim();
if (!brief) throw new Error('The mission brief is empty.');

const branch = `signal/${runId}`;
const worktree = await mkdtemp(join(tmpdir(), 'signal-worktree-'));
const artifactsDir = await mkdtemp(join(tmpdir(), 'signal-artifacts-'));
const summaryPath = join(artifactsDir, 'coding-agent-summary.md');
let deliveryReview;

try {
  emit('preflight', `Preparing ${basename(repo)} on ${remote}/${base} as ${branch}`);
  run('git', ['-C', repo, 'rev-parse', '--is-inside-work-tree']);
  run('git', ['-C', repo, 'remote', 'get-url', remote]);
  run('git', ['-C', repo, 'fetch', remote, base]);
  run('git', ['-C', repo, 'worktree', 'add', '-b', branch, worktree, `${remote}/${base}`]);

  const prompt = `You are implementing a bounded Signal build mission in ${repo}.

Mission title: ${title}
Mission brief:
${brief}

Work carefully in the current repository. First inspect its conventions and existing tests. Implement only the scoped change. Run the existing relevant tests and build. Do not create commits, push branches, or open pull requests: Signal handles those after the quality gates. In your final response, summarize changed files, tests run, and remaining risks.`;

  emit('implementing', 'Dispatching the configured coding agent');
  run('codex', ['exec', '-C', worktree, '-s', 'workspace-write', '-a', 'never', '-o', summaryPath, prompt], { cwd: worktree, maxBuffer: 10_000_000 });

  const scripts = packageScripts(worktree);
  if (scripts.test) {
    emit('testing', 'Running npm test');
    run('npm', ['test'], { cwd: worktree, maxBuffer: 10_000_000 });
  }
  if (scripts.build) {
    emit('testing', 'Running npm run build');
    run('npm', ['run', 'build'], { cwd: worktree, maxBuffer: 10_000_000 });
  }

  const changed = run('git', ['status', '--short'], { cwd: worktree });
  if (!changed) throw new Error('The coding agent completed without changing tracked files. No pull request was created.');

  const agentSummary = await readFile(summaryPath, 'utf8').catch(() => 'No agent summary was written.');
  if (deliveryReviewEnabled) {
    const deliveryInputPath = join(artifactsDir, 'delivery-input.json');
    const deliveryOutputPath = join(artifactsDir, 'delivery-review.json');
    const deliveryBundle = {
      schemaVersion: 1,
      mission: { title, brief },
      repository: basename(repo),
      branch,
      codingAgentSummary: agentSummary,
      changedFiles: changed,
      diffStat: run('git', ['diff', '--stat'], { cwd: worktree }),
      qualityGates: [
        { name: 'npm test', status: scripts.test ? 'passed' : 'not-configured' },
        { name: 'npm run build', status: scripts.build ? 'passed' : 'not-configured' }
      ],
      constraints: 'This is a delivery assessment for human pull-request review. It must never automatically approve a release.'
    };
    await writeFile(deliveryInputPath, `${JSON.stringify(deliveryBundle, null, 2)}\n`, 'utf8');
    try {
      emit('delivery-review', 'RocketRide is assessing the tested delivery before pull-request creation');
      run(process.execPath, [
        join(signalRoot, 'scripts/rocketride-delivery-review.mjs'),
        '--input', deliveryInputPath,
        '--output', deliveryOutputPath
      ], { cwd: signalRoot, maxBuffer: 10_000_000 });
      deliveryReview = JSON.parse(await readFile(deliveryOutputPath, 'utf8'));
      emit('delivery-review', `RocketRide delivery review: ${deliveryReview.verdict}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message.split('\n').at(-1) : String(error);
      emit('delivery-review-failed', `RocketRide did not produce a delivery review: ${detail}`);
      if (deliveryReviewRequired) throw new Error('A required RocketRide delivery review failed. No pull request was created.');
    }
  }

  emit('review-ready', 'Committing the tested change');
  run('git', ['add', '-A'], { cwd: worktree });
  run('git', ['commit', '-m', `feat: ${title}`], { cwd: worktree, maxBuffer: 10_000_000 });
  run('git', ['push', '-u', remote, branch], { cwd: worktree, maxBuffer: 10_000_000 });

  const bodyPath = join(artifactsDir, 'pull-request-body.md');
  const deliveryReviewSection = deliveryReview
    ? `## RocketRide delivery review\n\n**Verdict:** ${deliveryReview.verdict} (ready means ready for human PR review, never automatic release)\n\n${deliveryReview.summary}\n\n${deliveryReview.checks.map(check => `- [${check.status === 'passed' ? 'x' : ' '}] ${check.name}: ${check.detail}`).join('\n')}\n\n${deliveryReview.risks.length ? `### Risks\n\n${deliveryReview.risks.map(risk => `- **${risk.severity}:** ${risk.title} — ${risk.detail}`).join('\n')}\n` : ''}`
    : `## RocketRide delivery review\n\nNo live delivery review was attached. ${deliveryReviewEnabled ? 'The optional workflow did not produce a result; inspect the execution logs.' : 'It was not enabled for this execution.'}\n`;
  await writeFile(bodyPath, `## Signal build mission\n\n${brief}\n\n## Coding-agent summary\n\n${agentSummary}\n\n## Quality gates\n\n- [x] Existing tests passed\n- [x] Existing build passed\n- [ ] Human review\n\n${deliveryReviewSection}`, 'utf8');
  emit('opening-pr', 'Opening a pull request for human review');
  const prUrl = run('gh', ['pr', 'create', '--base', base, '--head', branch, '--title', title, '--body-file', bodyPath], { cwd: worktree, maxBuffer: 10_000_000 });
  emit('complete', prUrl);
} finally {
  try { run('git', ['-C', repo, 'worktree', 'remove', '--force', worktree]); } catch { await rm(worktree, { recursive: true, force: true }); }
  await rm(artifactsDir, { recursive: true, force: true });
}
