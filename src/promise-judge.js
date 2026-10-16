// The Promise Judge grades each specialist; the synthesizer only restates those
// grades. Signal reads the judge's own answer from RocketRide flow events and
// makes it the source of truth for the ledger, recording any disagreement.
const roles = [
  { name: 'Customer Advocate', initials: 'CA', pattern: /customer|advocate/i },
  { name: 'Skeptic', initials: 'SK', pattern: /skeptic|sceptic/i },
  { name: 'Product Strategist', initials: 'PS', pattern: /strateg/i }
];
const assessments = new Set(['kept', 'qualified', 'broken']);

export function roleFor(name) {
  return roles.find(role => role.pattern.test(String(name || '')));
}

export function parseJudgeAnswer(text) {
  if (typeof text !== 'string' || !text.trim()) return [];
  const body = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed;
  try { parsed = JSON.parse(body); } catch { return []; }
  const judgments = Array.isArray(parsed) ? parsed : parsed?.judgments;
  if (!Array.isArray(judgments)) return [];
  return judgments
    .map(judgment => ({
      role: roleFor(judgment?.agent),
      promise: String(judgment?.promise || '').trim(),
      assessment: String(judgment?.assessment || '').trim().toLowerCase(),
      evidence: String(judgment?.evidence || '').trim(),
      reason: String(judgment?.reason || '').trim()
    }))
    .filter(judgment => judgment.role && assessments.has(judgment.assessment));
}

export function applyJudgeVerdicts(report, judgeAnswer) {
  const judgments = parseJudgeAnswer(judgeAnswer);
  if (!judgments.length) {
    return { ...report, promiseJudge: { status: 'unavailable', judgments: [] } };
  }
  const promises = Array.isArray(report.promises) ? report.promises : [];
  const disagreements = [];
  const judged = judgments.map(judgment => {
    const stated = promises.find(promise => roleFor(promise.agent)?.name === judgment.role.name);
    if (stated && stated.assessment !== judgment.assessment) {
      disagreements.push({ agent: judgment.role.name, synthesizer: stated.assessment, judge: judgment.assessment });
    }
    return {
      agent: judgment.role.name,
      initials: judgment.role.initials,
      to: stated?.to || 'Synthesis',
      body: judgment.promise || stated?.body || 'Declared role promise.',
      evidence: judgment.evidence || stated?.evidence || 'No evidence named by the judge.',
      assessment: judgment.assessment,
      reason: judgment.reason,
      gradedBy: 'promise-judge'
    };
  });
  return {
    ...report,
    promises: judged,
    promiseJudge: { status: 'applied', judgments: judged.length, disagreements }
  };
}
