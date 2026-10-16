import assert from 'node:assert/strict';
import test from 'node:test';
import { canReplay, createWorkflow } from '../src/workflow.js';

test('recorded browser steps become a draft replay plan', () => {
  const workflow = createWorkflow('Lead enrichment', ['Open account', 'Save employee count']);
  assert.equal(workflow.status, 'draft');
  assert.equal(workflow.steps.length, 2);
  assert.equal(canReplay(workflow), true);
});

test('empty recorded steps cannot be replayed', () => {
  assert.equal(canReplay(createWorkflow('Empty', [' ', ''])), false);
});
