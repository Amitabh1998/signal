import assert from 'node:assert/strict';
import test from 'node:test';
import { numberDiff, verifyCitations } from '../src/diff-citations.js';
import { createFlowRecorder, scopeFlowSteps } from '../src/rocketride-flow.js';

let logSeq = 0;
const flow = (op, component, pipes, eventTime, lane = 'questions') => ({
  event: 'apaevt_flow',
  body: { op, component, pipes, trace: { lane }, eventTime, logSeq: logSeq++ }
});

test('nested flow events become exclusive-time engine steps', () => {
  const recorder = createFlowRecorder(scopeFlowSteps);
  [
    flow('enter', 'parse_evidence', ['in.txt', 'parse_evidence'], 100, 'tags'),
    flow('leave', 'parse_evidence', ['in.txt'], 100.5, 'tags'),
    flow('enter', 'customer_llm', ['in.txt', 'customer_prompt', 'customer_llm'], 100.5),
    flow('enter', 'customer_document', ['in.txt', 'customer_prompt', 'customer_llm', 'customer_document'], 103.5, 'answers'),
    flow('leave', 'customer_document', ['in.txt', 'customer_prompt', 'customer_llm'], 103.5, 'answers'),
    flow('leave', 'customer_llm', ['in.txt', 'customer_prompt'], 103.5),
    flow('enter', 'synthesis_llm', ['in.txt', 'synthesis_prompt', 'synthesis_llm'], 104),
    // The extractor runs nested inside the synthesis call; its time is its own.
    flow('enter', 'report_extractor', ['in.txt', 'synthesis_llm', 'synthesis_document', 'report_extractor'], 110, 'documents'),
    flow('leave', 'report_extractor', ['in.txt', 'synthesis_llm', 'synthesis_document'], 115, 'documents'),
    flow('leave', 'synthesis_llm', ['in.txt', 'synthesis_prompt'], 115),
    { event: 'apaevt_task', body: { action: 'running' } }
  ].forEach(message => recorder.onEvent(message));

  const { eventCount, durationMs, steps } = recorder.summarize();
  assert.equal(eventCount, 10);
  assert.equal(durationMs, 15_000);
  assert.deepEqual(steps.map(step => [step.label, step.startMs, step.durationMs, step.workMs]), [
    ['Parse evidence', 0, 500, 500],
    ['Customer advocate', 500, 3500, 3500],
    ['Decision synthesis', 4000, 6000, 6000],
    ['Enforce report contract', 10_000, 5000, 5000]
  ]);
});

test('a run without flow events has no engine steps', () => {
  assert.deepEqual(createFlowRecorder(scopeFlowSteps).summarize(), { eventCount: 0, durationMs: 0, steps: [] });
});

const patch = [
  'diff --git a/src/app.js b/src/app.js',
  '--- a/src/app.js',
  '+++ b/src/app.js',
  '@@ -10,3 +10,4 @@ export function run() {',
  ' const a = 1;',
  '-const b = 2;',
  '+const b = 3;',
  '+const c = 4;',
  ' return a;'
].join('\n');

test('diff lines are numbered with their new-file location', () => {
  const { numbered, lines } = numberDiff(patch);
  assert.match(numbered, /^src\/app\.js:10  const a = 1;$/m);
  assert.match(numbered, /^src\/app\.js:- -const b = 2;$/m);
  assert.match(numbered, /^src\/app\.js:11 \+const b = 3;$/m);
  assert.deepEqual([...lines], ['src/app.js:10', 'src/app.js:11', 'src/app.js:12', 'src/app.js:13']);
});

test('citations are verified against locations shown in the diff', () => {
  const { lines } = numberDiff(patch);
  assert.deepEqual(verifyCitations('See src/app.js:11 and src/app.js, line 12.', lines), {
    citations: ['src/app.js:11', 'src/app.js:12'],
    citationVerified: true
  });
  assert.equal(verifyCitations('src/app.js#L99', lines).citationVerified, false);
  assert.deepEqual(verifyCitations('Tests passed.', lines), { citations: [], citationVerified: false });
});
