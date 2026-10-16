import { canReplay, createWorkflow } from './workflow.js';

const form = document.querySelector('form');
const output = document.querySelector('#output');

form.addEventListener('submit', event => {
  event.preventDefault();
  const values = new FormData(form);
  const workflow = createWorkflow(values.get('name'), String(values.get('steps')).split('\n'));
  output.textContent = JSON.stringify({ ...workflow, replayReady: canReplay(workflow) }, null, 2);
});
