import assert from 'node:assert/strict';
import test from 'node:test';
import { applyJudgeVerdicts, parseJudgeAnswer } from '../src/promise-judge.js';

const judgeAnswer = '```json\n' + JSON.stringify({
  judgments: [
    { agent: 'Customer Advocate', promise: 'Ground every claim.', assessment: 'kept', evidence: '01-call.md', reason: 'Quotes match.' },
    { agent: 'The Skeptic', promise: 'Expose rival explanations.', assessment: 'qualified', evidence: '04-tickets.jsonl', reason: 'One rival only.' },
    { agent: 'Nadia Patel', promise: 'Not a role.', assessment: 'kept' },
    { agent: 'Product Strategist', promise: 'Smallest step.', assessment: 'approved' }
  ]
}) + '\n```';

test('judge answers keep only graded specialist roles', () => {
  assert.deepEqual(parseJudgeAnswer(judgeAnswer).map(item => [item.role.name, item.assessment]), [
    ['Customer Advocate', 'kept'],
    ['Skeptic', 'qualified']
  ]);
  assert.deepEqual(parseJudgeAnswer('not json'), []);
});

test('the judge, not the synthesizer, decides ledger grades', () => {
  const report = {
    promises: [
      { agent: 'Customer Advocate', to: 'Operations team', body: 'Ground claims', evidence: 'call', assessment: 'kept' },
      { agent: 'Skeptic', to: 'Product team', body: 'Challenge', evidence: 'tickets', assessment: 'kept' }
    ]
  };
  const judged = applyJudgeVerdicts(report, judgeAnswer);
  assert.deepEqual(judged.promises.map(promise => [promise.agent, promise.assessment, promise.gradedBy, promise.to]), [
    ['Customer Advocate', 'kept', 'promise-judge', 'Operations team'],
    ['Skeptic', 'qualified', 'promise-judge', 'Product team']
  ]);
  assert.deepEqual(judged.promiseJudge, {
    status: 'applied',
    judgments: 2,
    disagreements: [{ agent: 'Skeptic', synthesizer: 'kept', judge: 'qualified' }]
  });
});

test('without a readable judge answer the ledger is marked unavailable', () => {
  const report = { promises: [{ agent: 'Skeptic', assessment: 'kept' }] };
  const result = applyJudgeVerdicts(report, undefined);
  assert.equal(result.promiseJudge.status, 'unavailable');
  assert.equal(result.promises, report.promises);
});
