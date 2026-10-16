export function createWorkflow(name, recordedSteps) {
  const steps = recordedSteps.map((step, index) => ({
    id: `step-${index + 1}`,
    instruction: String(step).trim()
  })).filter(step => step.instruction);
  return {
    name: String(name).trim(),
    status: 'draft',
    steps,
    handoffNotes: ''
  };
}

// The seeded Signal mission deliberately asks the coding runner to replace
// this permissive replay rule with an explicit human approval gate.
export function canReplay(workflow) {
  return Boolean(workflow?.steps?.length);
}
