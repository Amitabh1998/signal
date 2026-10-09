import { demoReport } from './demo-data.js';

const cloneReport = report => structuredClone(report);

const activationReport = cloneReport(demoReport);

const pricingReport = cloneReport(demoReport);
pricingReport.reportId = 'demo_pricing_01';
pricingReport.recommendation = {
  title: 'Test a usage-based starter plan before changing the enterprise package.',
  summary: 'The strongest evidence says small teams understand value only after their first automated workflow, while enterprise objections are mostly procurement language.',
  confidence: 78,
  supportingEvidence: 9,
  challengingEvidence: 4
};
pricingReport.sources = [
  { id: 'p1', kind: 'CALL', name: 'Rina - BrightCart', meta: 'Customer call - 27m', contentStatus: 'fixture', content: 'Rina: "I could not tell whether we would pay for seats, workflows, or documents. We are two people right now, so the annual package felt like a procurement conversation before I had proof."', status: 'ready' },
  { id: 'p2', kind: 'CALL', name: 'Dev - OrbitOps', meta: 'Customer call - 33m', contentStatus: 'fixture', content: 'Dev: "Once the first approval workflow ran, the price made sense. Before that, I wanted a way to swipe a card and cap usage so I could prove it internally."', status: 'ready' },
  { id: 'p3', kind: 'TKT', name: 'Billing tickets #18', meta: '21 tickets - Sep', contentStatus: 'fixture', content: 'Eight tickets ask how usage is metered. Five ask whether a small pilot can start without annual procurement. Four request an enterprise discount. Four are unrelated billing hygiene.', status: 'ready' },
  { id: 'p4', kind: 'DATA', name: 'Trial conversion slice', meta: 'CSV - 1,320 rows', contentStatus: 'fixture', content: 'Teams that created one automated workflow converted at 34 percent. Teams that reached the pricing page before creating a workflow converted at 7 percent. Segment sizes are uneven.', status: 'ready' },
  { id: 'p5', kind: 'NOTE', name: 'Sales desk notes', meta: 'CRM export - Q4', contentStatus: 'fixture', content: 'Enterprise prospects still require annual contracts, legal review, and custom procurement terms. Sales warns against disrupting the current enterprise quote motion.', status: 'ready' },
  { id: 'p6', kind: 'IMG', name: 'Pricing page teardown', meta: '6 screenshots', contentStatus: 'fixture', content: 'Fixture description: screenshots compare seat-first, usage-first, and workflow-first pricing pages from adjacent products.', status: 'ready' }
];
pricingReport.signals = [
  { index: 'S-01', strength: 'Strong', title: 'Small teams need a low-risk way to prove value', body: 'Calls and tickets repeatedly ask for a card-based pilot, a usage cap, and clear metering.', people: ['RB', 'DO', 'MK'], sourceLabel: '5 sources' },
  { index: 'S-02', strength: 'Medium', title: 'Value clicks after one automated workflow', body: 'Conversion jumps after the first workflow, suggesting price education belongs after activation.', people: ['CN', 'JP'], sourceLabel: '2 sources' },
  { index: 'S-03', strength: 'Medium', title: 'Enterprise motion should be protected', body: 'Procurement objections are real, but they come from a different buyer journey.', people: ['SA', 'LE'], sourceLabel: '2 sources' }
];
pricingReport.proofs = [
  { id: 'p-proof-1', claim: 'Pricing confusion happens before value is experienced.', sourceId: 'p1', sourceName: 'Rina - BrightCart', agent: 'Customer advocate', status: 'supported', quote: 'the annual package felt like a procurement conversation before I had proof' },
  { id: 'p-proof-2', claim: 'A capped starter motion would reduce evaluation risk.', sourceId: 'p2', sourceName: 'Dev - OrbitOps', agent: 'Product strategist', status: 'supported', quote: 'swipe a card and cap usage so I could prove it internally' },
  { id: 'p-proof-3', claim: 'Enterprise packaging should not be redesigned from startup evidence.', sourceId: 'p5', sourceName: 'Sales desk notes', agent: 'Skeptic', status: 'qualified', quote: 'Enterprise prospects still require annual contracts' },
  { id: 'p-proof-4', claim: 'Activation is a stronger predictor than pricing-page visits.', sourceId: 'p4', sourceName: 'Trial conversion slice', agent: 'Synthesis', status: 'supported', quote: 'Teams that created one automated workflow converted at 34 percent' }
];
pricingReport.contradiction = {
  title: 'Buyers ask for simpler pricing, but conversion depends on seeing value first.',
  body: 'A pricing redesign alone could optimize the wrong step. Test a starter path that moves price clarity next to the first workflow.',
  forQuote: 'Five tickets ask for a small pilot without procurement.',
  againstQuote: 'Workflow creators convert 4.8x higher than pricing-page visitors.'
};
pricingReport.experiment = {
  title: 'Launch a capped usage starter plan for new self-serve teams.',
  body: 'Offer a $99 monthly starter plan after the first workflow is created. Keep enterprise quotes untouched.',
  window: '21 days',
  metric: '+15% self-serve activation-to-paid'
};
pricingReport.lenses = [
  { initials: 'CA', name: 'Customer advocate', note: '5 evidence links', vote: 'supports' },
  { initials: 'SK', name: 'Skeptic', note: 'enterprise caveat', vote: 'qualified' },
  { initials: 'PS', name: 'Product strategist', note: 'starter experiment', vote: 'supports' }
];
pricingReport.pipeline = [
  { label: 'Ingest', detail: '6 files' },
  { label: 'Parse', detail: '1,420 lines' },
  { label: 'Advocate', detail: '3 signals' },
  { label: 'Skeptic', detail: '4 challenges' },
  { label: 'Strategist', detail: '2 packages' },
  { label: 'Synthesize', detail: '1 pricing bet' },
  { label: 'Trace', detail: '13 links' }
];
pricingReport.promises = [
  { agent: 'Evidence inlet', initials: 'IN', to: 'Parser', body: 'Separate self-serve and enterprise evidence', evidence: '6/6 source labels retained', assessment: 'kept' },
  { agent: 'Customer advocate', initials: 'CA', to: 'Synthesis', body: 'Identify buyer confusion before proposing packaging', evidence: '4 source-backed confusion claims', assessment: 'kept' },
  { agent: 'Skeptic', initials: 'SK', to: 'Synthesis', body: 'Protect enterprise signal from self-serve overreach', evidence: '1 enterprise caveat preserved', assessment: 'kept' },
  { agent: 'Product strategist', initials: 'PS', to: 'Synthesis', body: 'Recommend a reversible packaging test', evidence: '21-day starter plan experiment', assessment: 'kept' },
  { agent: 'Synthesis', initials: 'SY', to: 'Decision room', body: 'Cap confidence because segments are uneven', evidence: 'Confidence capped at 78%', assessment: 'kept' }
];
pricingReport.semanticMap = {
  nodes: [
    { id: 'decision', label: 'Starter plan', sub: 'decision', type: 'decision', x: 385, y: 240, radius: 45 },
    { id: 'advocate', label: 'Advocate', sub: 'agent', type: 'agent', x: 210, y: 155, radius: 31 },
    { id: 'skeptic', label: 'Skeptic', sub: 'agent', type: 'agent', x: 560, y: 160, radius: 31 },
    { id: 'strategist', label: 'Strategist', sub: 'agent', type: 'agent', x: 530, y: 345, radius: 31 },
    { id: 'calls', label: 'Buyer calls', sub: '2 calls', type: 'source', x: 95, y: 92, radius: 29 },
    { id: 'billing', label: 'Billing tickets', sub: '21 tickets', type: 'source', x: 95, y: 245, radius: 29 },
    { id: 'conversion', label: 'Conversion', sub: '1,320 rows', type: 'source', x: 215, y: 395, radius: 29 },
    { id: 'sales', label: 'Sales notes', sub: 'enterprise', type: 'source', x: 685, y: 92, radius: 29 },
    { id: 'experiment', label: 'Starter test', sub: '21 days', type: 'source', x: 680, y: 375, radius: 29 }
  ],
  edges: [
    { from: 'calls', to: 'advocate', kind: 'supports' },
    { from: 'billing', to: 'advocate', kind: 'supports' },
    { from: 'conversion', to: 'decision', kind: 'supports' },
    { from: 'advocate', to: 'decision', kind: 'supports' },
    { from: 'sales', to: 'skeptic', kind: 'challenges' },
    { from: 'conversion', to: 'skeptic', kind: 'challenges' },
    { from: 'skeptic', to: 'decision', kind: 'challenges' },
    { from: 'decision', to: 'strategist', kind: 'supports' },
    { from: 'strategist', to: 'experiment', kind: 'supports' }
  ]
};

const securityReport = cloneReport(demoReport);
securityReport.reportId = 'demo_security_01';
securityReport.recommendation = {
  title: 'Build an audit-ready security center before adding another integration.',
  summary: 'Enterprise teams are not blocked by missing destinations; they are blocked by proving access, retention, and incident readiness to security reviewers.',
  confidence: 82,
  supportingEvidence: 10,
  challengingEvidence: 3
};
securityReport.sources = [
  { id: 'e1', kind: 'CALL', name: 'Nadia - Finlytics', meta: 'Security review - 42m', contentStatus: 'fixture', content: 'Nadia: "We like the workflow coverage, but I cannot approve rollout until admins can export access logs and prove who touched customer data."', status: 'ready' },
  { id: 'e2', kind: 'CALL', name: 'Marcus - HelioBank', meta: 'Buyer call - 35m', contentStatus: 'fixture', content: 'Marcus: "The Salesforce integration is nice, but our security committee asked about retention, audit trails, and SCIM before they asked about any new app."', status: 'ready' },
  { id: 'e3', kind: 'TKT', name: 'Enterprise blockers #7', meta: '16 tickets - Oct', contentStatus: 'fixture', content: 'Seven tickets request audit logs. Four ask about retention controls. Three ask for SCIM. Two request a Jira integration.', status: 'ready' },
  { id: 'e4', kind: 'DATA', name: 'Deal review board', meta: 'CRM - 43 opps', contentStatus: 'fixture', content: 'Security review was named as the primary blocker in 11 opportunities worth $1.8M pipeline. Missing integrations were named primary in 3 opportunities worth $410K.', status: 'ready' },
  { id: 'e5', kind: 'NOTE', name: 'Solutions feedback', meta: 'Slack digest - Q4', contentStatus: 'fixture', content: 'Solutions engineering can answer integration gaps manually, but audit evidence requires product support because screenshots are not accepted by reviewers.', status: 'ready' },
  { id: 'e6', kind: 'IMG', name: 'Admin console references', meta: '5 screenshots', contentStatus: 'fixture', content: 'Fixture description: screenshots show audit-log exports, retention controls, and security-center layouts from enterprise SaaS products.', status: 'ready' }
];
securityReport.signals = [
  { index: 'S-01', strength: 'Strong', title: 'Security proof blocks rollout', body: 'Reviewers repeatedly ask for exportable access logs, retention controls, and SCIM before approving expansion.', people: ['NF', 'MB', 'SK'], sourceLabel: '5 sources' },
  { index: 'S-02', strength: 'Strong', title: 'Audit evidence is tied to revenue risk', body: 'Security review is the primary blocker in a materially larger pipeline segment than missing integrations.', people: ['AE', 'SE'], sourceLabel: '2 sources' },
  { index: 'S-03', strength: 'Medium', title: 'Integration gaps have manual workarounds', body: 'Solutions can bridge many destination asks, while audit proof needs productized evidence.', people: ['SO', 'AM'], sourceLabel: '2 sources' }
];
securityReport.proofs = [
  { id: 'e-proof-1', claim: 'Audit-log export is required for enterprise approval.', sourceId: 'e1', sourceName: 'Nadia - Finlytics', agent: 'Customer advocate', status: 'supported', quote: 'export access logs and prove who touched customer data' },
  { id: 'e-proof-2', claim: 'Security requirements outrank new integrations in review.', sourceId: 'e2', sourceName: 'Marcus - HelioBank', agent: 'Skeptic', status: 'supported', quote: 'retention, audit trails, and SCIM before they asked about any new app' },
  { id: 'e-proof-3', claim: 'Security blocker has higher revenue impact.', sourceId: 'e4', sourceName: 'Deal review board', agent: 'Synthesis', status: 'supported', quote: 'primary blocker in 11 opportunities worth $1.8M pipeline' },
  { id: 'e-proof-4', claim: 'Integration requests should still cap confidence.', sourceId: 'e3', sourceName: 'Enterprise blockers #7', agent: 'Skeptic', status: 'qualified', quote: 'Two request a Jira integration' }
];
securityReport.contradiction = {
  title: 'Integrations are louder in demos, but security proof blocks approval.',
  body: 'The visible request queue favors integrations, while revenue evidence points toward audit readiness.',
  forQuote: 'Two tickets request a Jira integration.',
  againstQuote: 'Security review blocks 11 opportunities worth $1.8M.'
};
securityReport.experiment = {
  title: 'Ship a read-only security center for three enterprise evaluations.',
  body: 'Expose access-log export, retention settings, and SCIM status. Measure whether security review time drops.',
  window: '30 days',
  metric: '-25% security review cycle time'
};
securityReport.lenses = [
  { initials: 'CA', name: 'Customer advocate', note: 'security proof need', vote: 'supports' },
  { initials: 'SK', name: 'Skeptic', note: 'integration demand remains', vote: 'qualified' },
  { initials: 'PS', name: 'Product strategist', note: 'enterprise pilot', vote: 'supports' }
];
securityReport.pipeline = [
  { label: 'Ingest', detail: '6 files' },
  { label: 'Parse', detail: '1,760 lines' },
  { label: 'Advocate', detail: '3 blockers' },
  { label: 'Skeptic', detail: '3 objections' },
  { label: 'Strategist', detail: '1 pilot' },
  { label: 'Synthesize', detail: '1 enterprise bet' },
  { label: 'Trace', detail: '14 links' }
];
securityReport.promises = [
  { agent: 'Evidence inlet', initials: 'IN', to: 'Parser', body: 'Preserve customer, sales, and solutions source boundaries', evidence: '6/6 source headers retained', assessment: 'kept' },
  { agent: 'Customer advocate', initials: 'CA', to: 'Synthesis', body: 'Prioritize explicit approval blockers', evidence: '3 audit-readiness blockers cited', assessment: 'kept' },
  { agent: 'Skeptic', initials: 'SK', to: 'Synthesis', body: 'Keep integration demand visible', evidence: 'Jira request retained as challenge', assessment: 'kept' },
  { agent: 'Product strategist', initials: 'PS', to: 'Synthesis', body: 'Shape a measurable enterprise pilot', evidence: '30-day security-center pilot', assessment: 'kept' },
  { agent: 'Synthesis', initials: 'SY', to: 'Decision room', body: 'Tie recommendation to revenue-weighted evidence', evidence: 'Pipeline impact included', assessment: 'kept' }
];
securityReport.semanticMap = {
  nodes: [
    { id: 'decision', label: 'Security center', sub: 'decision', type: 'decision', x: 385, y: 240, radius: 45 },
    { id: 'advocate', label: 'Advocate', sub: 'agent', type: 'agent', x: 210, y: 155, radius: 31 },
    { id: 'skeptic', label: 'Skeptic', sub: 'agent', type: 'agent', x: 560, y: 160, radius: 31 },
    { id: 'strategist', label: 'Strategist', sub: 'agent', type: 'agent', x: 530, y: 345, radius: 31 },
    { id: 'reviews', label: 'Reviews', sub: '2 calls', type: 'source', x: 95, y: 92, radius: 29 },
    { id: 'tickets', label: 'Blockers', sub: '16 tickets', type: 'source', x: 95, y: 245, radius: 29 },
    { id: 'crm', label: 'CRM board', sub: '43 opps', type: 'source', x: 215, y: 395, radius: 29 },
    { id: 'solutions', label: 'Solutions', sub: 'Slack', type: 'source', x: 685, y: 92, radius: 29 },
    { id: 'experiment', label: 'Security pilot', sub: '30 days', type: 'source', x: 680, y: 375, radius: 29 }
  ],
  edges: [
    { from: 'reviews', to: 'advocate', kind: 'supports' },
    { from: 'tickets', to: 'advocate', kind: 'supports' },
    { from: 'crm', to: 'decision', kind: 'supports' },
    { from: 'advocate', to: 'decision', kind: 'supports' },
    { from: 'solutions', to: 'skeptic', kind: 'challenges' },
    { from: 'tickets', to: 'skeptic', kind: 'challenges' },
    { from: 'skeptic', to: 'decision', kind: 'challenges' },
    { from: 'decision', to: 'strategist', kind: 'supports' },
    { from: 'strategist', to: 'experiment', kind: 'supports' }
  ]
};

const browserReport = cloneReport(demoReport);
browserReport.reportId = 'demo_browser_agent_01';
browserReport.recommendation = {
  title: 'Build the watch-to-workflow browser agent before adding more static templates.',
  summary: 'The active pain is repeated browser labor: users want one successful human run to become a reviewed, replayable workflow with checkpoints and handoff notes.',
  confidence: 86,
  supportingEvidence: 12,
  challengingEvidence: 3
};
browserReport.sources = [
  { id: 'b1', kind: 'CLIP', name: 'Lead enrichment screen recording', meta: 'Workflow clip - 4m 12s', contentStatus: 'fixture', content: 'Clip transcript: "I open LinkedIn, copy the company domain, check Clearbit, paste the employee count into Salesforce, add a note, then repeat it 43 times. If the agent could watch this once and repeat with approval, I would use it every day."', status: 'ready' },
  { id: 'b2', kind: 'CALL', name: 'Jenny - Rebld', meta: 'Founder interview - 29m', contentStatus: 'fixture', content: 'Jenny: "Templates are fine, but they still make me explain the workflow. I want to do the task once while the agent watches, then approve the replay plan."', status: 'ready' },
  { id: 'b3', kind: 'TKT', name: 'Automation tickets #31', meta: '27 tickets - Oct', contentStatus: 'fixture', content: 'Nine tickets ask for recording browser workflows. Six ask for lead enrichment automation. Five ask for invoice reconciliation. Four ask for onboarding checks. Three ask for more static templates.', status: 'ready' },
  { id: 'b4', kind: 'DATA', name: 'Ops time study', meta: 'CSV - 480 runs', contentStatus: 'fixture', content: 'Lead enrichment takes a median of 7.4 minutes per account and repeats 43 times per week. Invoice matching takes 11.2 minutes per vendor and repeats 18 times per week. Manual error rate is 8.6 percent.', status: 'ready' },
  { id: 'b5', kind: 'IMG', name: 'Workflow builder teardown', meta: '5 screenshots', contentStatus: 'fixture', content: 'Screenshot notes: current workflow builders start from blank templates. None show a watched browser run becoming editable steps with checks, variables, and approval gates.', status: 'ready' },
  { id: 'b6', kind: 'NOTE', name: 'Security constraints', meta: 'Engineering note - Q4', contentStatus: 'fixture', content: 'The recorder must redact secrets, scope credentials per workflow, pause on low confidence, and ask for human approval before writing to external systems.', status: 'ready' }
];
browserReport.signals = [
  { index: 'S-01', strength: 'Strong', title: 'Users want recording, not another blank template', body: 'Interview and tickets repeatedly ask for an agent that watches a real run and turns it into a replay plan.', people: ['JR', 'MO', 'AL'], sourceLabel: '4 sources' },
  { index: 'S-02', strength: 'Strong', title: 'Repeated browser work has measurable drag', body: 'Lead enrichment and invoice matching repeat weekly with enough volume to justify automation.', people: ['OP', 'AE'], sourceLabel: '2 sources' },
  { index: 'S-03', strength: 'Medium', title: 'Safety gates are part of the product', body: 'Credential scoping, secret redaction, low-confidence pauses, and approvals are required for trust.', people: ['SE', 'QA'], sourceLabel: '2 sources' }
];
browserReport.proofs = [
  { id: 'b-proof-1', claim: 'The key product job is watch once, replay with approval.', sourceId: 'b2', sourceName: 'Jenny - Rebld', agent: 'Customer advocate', status: 'supported', quote: 'I want to do the task once while the agent watches, then approve the replay plan.' },
  { id: 'b-proof-2', claim: 'Lead enrichment is a high-frequency wedge.', sourceId: 'b4', sourceName: 'Ops time study', agent: 'Product strategist', status: 'supported', quote: 'Lead enrichment takes a median of 7.4 minutes per account and repeats 43 times per week.' },
  { id: 'b-proof-3', claim: 'Static templates are weaker than watched-run generation.', sourceId: 'b5', sourceName: 'Workflow builder teardown', agent: 'Skeptic', status: 'qualified', quote: 'current workflow builders start from blank templates' },
  { id: 'b-proof-4', claim: 'The automation must pause before unsafe writes.', sourceId: 'b6', sourceName: 'Security constraints', agent: 'Security reviewer', status: 'supported', quote: 'ask for human approval before writing to external systems' }
];
browserReport.contradiction = {
  title: 'Users ask for automation, but trust requires visible control.',
  body: 'The winning wedge is not full autonomy. It is a watched browser run converted into editable steps, checks, approvals, and replay evidence.',
  forQuote: 'Do the task once while the agent watches.',
  againstQuote: 'Ask for human approval before writing to external systems.'
};
browserReport.experiment = {
  title: 'Ship one watched-run flow for lead enrichment.',
  body: 'Record a human lead-enrichment run, infer variables, generate checks, and replay only after user approval.',
  window: '10 days',
  metric: '-60% manual enrichment time'
};
browserReport.lenses = [
  { initials: 'CA', name: 'Customer advocate', note: 'watched-run pull', vote: 'supports' },
  { initials: 'SK', name: 'Skeptic', note: 'template demand remains', vote: 'qualified' },
  { initials: 'SE', name: 'Security reviewer', note: 'approval gates required', vote: 'supports' }
];
browserReport.pipeline = [
  { label: 'Ingest', detail: '6 sources' },
  { label: 'Parse', detail: 'clip + notes' },
  { label: 'Advocate', detail: '3 jobs' },
  { label: 'Skeptic', detail: '3 risks' },
  { label: 'Strategist', detail: '1 wedge' },
  { label: 'Synthesize', detail: '1 blueprint' },
  { label: 'Trace', detail: '15 links' }
];
browserReport.promises = [
  { agent: 'Evidence inlet', initials: 'IN', to: 'Parser', body: 'Preserve source boundaries across clip, tickets, data, and notes', evidence: '6/6 sources retained', assessment: 'kept' },
  { agent: 'Customer advocate', initials: 'CA', to: 'Synthesis', body: 'Ground user pain in exact workflow evidence', evidence: '4 proof claims linked', assessment: 'kept' },
  { agent: 'Skeptic', initials: 'SK', to: 'Synthesis', body: 'Keep template and safety objections visible', evidence: '3 risks retained', assessment: 'kept' },
  { agent: 'Product strategist', initials: 'PS', to: 'Synthesis', body: 'Pick one active workflow wedge', evidence: 'lead enrichment selected', assessment: 'kept' },
  { agent: 'Security reviewer', initials: 'SE', to: 'Decision room', body: 'Block unsafe unattended writes', evidence: 'approval gate included', assessment: 'kept' }
];
browserReport.semanticMap = {
  nodes: [
    { id: 'decision', label: 'Watch-to-workflow', sub: 'decision', type: 'decision', x: 385, y: 240, radius: 45 },
    { id: 'advocate', label: 'Advocate', sub: 'agent', type: 'agent', x: 210, y: 155, radius: 31 },
    { id: 'skeptic', label: 'Skeptic', sub: 'agent', type: 'agent', x: 560, y: 160, radius: 31 },
    { id: 'security', label: 'Security', sub: 'agent', type: 'agent', x: 530, y: 345, radius: 31 },
    { id: 'clip', label: 'Browser clip', sub: 'recording', type: 'source', x: 95, y: 92, radius: 29 },
    { id: 'tickets', label: 'Tickets', sub: '27 asks', type: 'source', x: 95, y: 245, radius: 29 },
    { id: 'time', label: 'Time study', sub: '480 runs', type: 'source', x: 215, y: 395, radius: 29 },
    { id: 'teardown', label: 'Teardown', sub: 'templates', type: 'source', x: 685, y: 92, radius: 29 },
    { id: 'constraints', label: 'Safety gates', sub: 'Q4 note', type: 'source', x: 680, y: 375, radius: 29 }
  ],
  edges: [
    { from: 'clip', to: 'advocate', kind: 'supports' },
    { from: 'tickets', to: 'advocate', kind: 'supports' },
    { from: 'time', to: 'decision', kind: 'supports' },
    { from: 'advocate', to: 'decision', kind: 'supports' },
    { from: 'teardown', to: 'skeptic', kind: 'challenges' },
    { from: 'constraints', to: 'security', kind: 'supports' },
    { from: 'skeptic', to: 'decision', kind: 'challenges' },
    { from: 'security', to: 'decision', kind: 'supports' },
    { from: 'decision', to: 'time', kind: 'supports' }
  ]
};

const invoiceReport = cloneReport(browserReport);
invoiceReport.reportId = 'demo_invoice_agent_01';
invoiceReport.recommendation = {
  title: 'Use invoice reconciliation as the second watched-run workflow.',
  summary: 'The same browser-agent pattern applies, but finance workflows need stricter approvals before writes.',
  confidence: 79,
  supportingEvidence: 8,
  challengingEvidence: 4
};
invoiceReport.experiment = {
  title: 'Record one AP clerk matching vendor invoice rows.',
  body: 'Infer vendor, amount, PO, and exception checks; pause before changing accounting records.',
  window: '14 days',
  metric: '-40% reconciliation handling time'
};

const onboardingReport = cloneReport(browserReport);
onboardingReport.reportId = 'demo_onboarding_agent_01';
onboardingReport.recommendation = {
  title: 'Use onboarding checks as the safest customer-facing workflow wedge.',
  summary: 'Onboarding status checks show clear value with lower write-risk than finance or CRM updates.',
  confidence: 81,
  supportingEvidence: 9,
  challengingEvidence: 3
};
onboardingReport.experiment = {
  title: 'Record a CSM checking one new customer workspace.',
  body: 'Generate a repeatable checklist across product usage, billing, permissions, and support notes.',
  window: '10 days',
  metric: '-50% onboarding review time'
};

export const scenarioLibrary = [
  {
    id: 'browser-workflow-agent',
    title: 'Browser agent: lead enrichment',
    summary: 'Watch a user enrich one lead, then replay it with approval.',
    decisionType: 'Active workflow wedge',
    risk: 'Replay may fail on changed pages or unsafe writes.',
    evidenceMix: 'Workflow clip, founder interview, tickets, time study, screenshots, security notes',
    expectedTitle: browserReport.recommendation.title,
    expectedBody: 'The outcome should pick a watched-run browser agent over more static templates, starting with lead enrichment.',
    evidenceText: browserReport.sources.map(source => `SOURCE: ${source.name}\n${source.content}`).join('\n\n'),
    report: browserReport
  },
  {
    id: 'invoice-reconciliation',
    title: 'Browser agent: invoice matching',
    summary: 'Watch AP match one invoice, then replay with exception checks.',
    decisionType: 'Finance automation wedge',
    risk: 'Accounting writes need stricter approvals.',
    evidenceMix: 'Workflow clip, finance tickets, time study, security notes',
    expectedTitle: invoiceReport.recommendation.title,
    expectedBody: 'The outcome should extend the watched-run agent to invoice matching only after strong approval gates exist.',
    evidenceText: invoiceReport.sources.map(source => `SOURCE: ${source.name}\n${source.content}`).join('\n\n'),
    report: invoiceReport
  },
  {
    id: 'customer-onboarding-checks',
    title: 'Browser agent: onboarding checks',
    summary: 'Watch a CSM review one account, then schedule the checklist.',
    decisionType: 'Customer ops wedge',
    risk: 'Must avoid surfacing stale or private account data.',
    evidenceMix: 'CSM call notes, support tickets, workflow screenshots, time study',
    expectedTitle: onboardingReport.recommendation.title,
    expectedBody: 'The outcome should present onboarding checks as the safest customer-facing watched-run workflow.',
    evidenceText: onboardingReport.sources.map(source => `SOURCE: ${source.name}\n${source.content}`).join('\n\n'),
    report: onboardingReport
  }
];

export function getScenario(id) {
  return scenarioLibrary.find(scenario => scenario.id === id) || scenarioLibrary[0];
}
