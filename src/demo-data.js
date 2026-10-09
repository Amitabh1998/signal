export const demoReport = {
  schemaVersion: 1,
  mode: 'demo',
  reportId: 'demo_arcade_01',
  generatedAt: '2026-10-08T12:00:00.000Z',
  recommendation: {
    title: 'Ship a guided permissions setup before adding more customization.',
    summary: 'The evidence points to configuration anxiety—not missing flexibility—as the activation bottleneck for larger teams.',
    confidence: 84,
    supportingEvidence: 11,
    challengingEvidence: 3
  },
  sources: [
    { id: 's1', kind: 'CALL', name: 'Maya — Northstar', meta: 'Customer call · 31m', contentStatus: 'fixture', content: 'Maya: “I stopped at the roles screen because I was not sure if changing a default would lock the rest of my team out. I wanted something that said: start here, you can change it later.”', status: 'ready' },
    { id: 's2', kind: 'CALL', name: 'Jon — Pilot Labs', meta: 'Customer call · 24m', contentStatus: 'fixture', content: 'Jon: “We absolutely need granular permissions eventually, but the first setup had too many decisions. I copied another team’s workspace because I did not know what good looked like.”', status: 'ready' },
    { id: 's3', kind: 'TKT', name: 'Support digest #42', meta: '18 tickets · Oct 03', contentStatus: 'fixture', content: 'Six tickets ask whether permission changes are reversible. Four request recommended defaults. Three request more granular roles. The remaining five are unrelated to permissions.', status: 'ready' },
    { id: 's4', kind: 'DATA', name: 'Activation cohorts', meta: 'CSV · 2,840 rows', contentStatus: 'fixture', content: 'Preset workspaces reached a first shared project in a median of 1.7 days; custom-setup workspaces took 3.1 days. This sample is observational and may be confounded by team maturity and size.', status: 'ready' },
    { id: 's5', kind: 'NOTE', name: 'Sales objections', meta: 'Notion export · Q4', contentStatus: 'fixture', content: 'Four enterprise prospects requested more granular roles before procurement. They are not active customers and are not treated as activation evidence.', status: 'ready' },
    { id: 's6', kind: 'IMG', name: 'Rival onboarding', meta: '4 screenshots', contentStatus: 'fixture', content: 'Fixture description: four competitor onboarding screenshots compare preset-first and custom-first permission flows. Image binaries are not included in this demo.', status: 'ready' }
  ],
  signals: [
    {
      index: 'S-01', strength: 'Strong',
      title: 'Admins fear breaking a shared workspace',
      body: 'Six teams paused during permissions setup or asked for a “safe default.”',
      people: ['MS', 'JP', 'AK'], sourceLabel: '6 sources'
    },
    {
      index: 'S-02', strength: 'Strong',
      title: 'Flexibility is discovered after activation',
      body: 'Advanced controls are valued—but only after teams complete their first shared workflow.',
      people: ['LN', 'RV'], sourceLabel: '4 sources'
    },
    {
      index: 'S-03', strength: 'Medium',
      title: 'Templates reduce time-to-first-value',
      body: 'Template users reached a collaborative event 1.8× faster in the sample cohort.',
      people: ['DB', 'CO', '+'], sourceLabel: '2 sources'
    }
  ],
  proofs: [
    {
      id: 'p1',
      claim: 'Configuration anxiety is the activation bottleneck.',
      sourceId: 's1',
      sourceName: 'Maya — Northstar',
      agent: 'Customer advocate',
      status: 'supported',
      quote: 'I stopped at the roles screen because I was not sure if changing a default would lock the rest of my team out.'
    },
    {
      id: 'p2',
      claim: 'Advanced permissions matter later, not first.',
      sourceId: 's2',
      sourceName: 'Jon — Pilot Labs',
      agent: 'Skeptic',
      status: 'qualified',
      quote: 'We absolutely need granular permissions eventually, but the first setup had too many decisions.'
    },
    {
      id: 'p3',
      claim: 'Opinionated templates are the smallest reversible experiment.',
      sourceId: 's4',
      sourceName: 'Activation cohorts',
      agent: 'Product strategist',
      status: 'supported',
      quote: 'Preset workspaces reached a first shared project in a median of 1.7 days; custom-setup workspaces took 3.1 days.'
    },
    {
      id: 'p4',
      claim: 'Enterprise sales objections should cap confidence.',
      sourceId: 's5',
      sourceName: 'Sales objections',
      agent: 'Skeptic',
      status: 'challenged',
      quote: 'Four enterprise prospects requested more granular roles before procurement.'
    }
  ],
  contradiction: {
    title: 'Customers ask for control, but behavior rewards fewer choices.',
    body: 'The request language and observed activation behavior point in different directions. Treat this as an experiment, not a settled truth.',
    forQuote: '“We need more granular roles.” — 4 interviews',
    againstQuote: 'Preset users activate 1.8× faster — cohort data'
  },
  experiment: {
    title: 'Offer three opinionated permission templates to new team admins.',
    body: 'Randomize 20 qualifying workspaces. Preserve the advanced path, but move it behind “custom setup.”',
    window: '14 days',
    metric: '+20% shared activation'
  },
  lenses: [
    { initials: 'CA', name: 'Customer advocate', note: '6 evidence links', vote: 'supports' },
    { initials: 'SK', name: 'Skeptic', note: '3 challenges raised', vote: 'qualified' },
    { initials: 'PS', name: 'Product strategist', note: '1 experiment shaped', vote: 'supports' }
  ],
  pipeline: [
    { label: 'Ingest', detail: '6 files' },
    { label: 'Parse', detail: '1,840 lines' },
    { label: 'Advocate', detail: '4 signals' },
    { label: 'Skeptic', detail: '3 challenges' },
    { label: 'Strategist', detail: '2 bets' },
    { label: 'Synthesize', detail: '1 decision' },
    { label: 'Trace', detail: '14 links' }
  ],
  promises: [
    { agent: 'Evidence inlet', initials: 'IN', to: 'Parser', body: 'Preserve source boundaries and labels', evidence: '6/6 source headers retained', assessment: 'kept' },
    { agent: 'Customer advocate', initials: 'CA', to: 'Synthesis', body: 'Ground every customer claim in evidence', evidence: '6 claims · 6 source links', assessment: 'kept' },
    { agent: 'Skeptic', initials: 'SK', to: 'Synthesis', body: 'Expose rival explanations and weak inference', evidence: '3 challenges · 1 confounder', assessment: 'kept' },
    { agent: 'Product strategist', initials: 'PS', to: 'Synthesis', body: 'Offer a reversible, measurable next step', evidence: '14-day randomized template test', assessment: 'kept' },
    { agent: 'Synthesis', initials: 'SY', to: 'Decision room', body: 'State no conclusion stronger than its evidence', evidence: 'Confidence capped at 84%', assessment: 'kept' }
  ],
  semanticMap: {
    nodes: [
      { id: 'decision', label: 'Guided setup', sub: 'decision', type: 'decision', x: 385, y: 240, radius: 45 },
      { id: 'advocate', label: 'Advocate', sub: 'agent', type: 'agent', x: 210, y: 155, radius: 31 },
      { id: 'skeptic', label: 'Skeptic', sub: 'agent', type: 'agent', x: 560, y: 160, radius: 31 },
      { id: 'strategist', label: 'Strategist', sub: 'agent', type: 'agent', x: 530, y: 345, radius: 31 },
      { id: 'interviews', label: 'Interviews', sub: '3 sources', type: 'source', x: 95, y: 92, radius: 29 },
      { id: 'support', label: 'Support #42', sub: '18 tickets', type: 'source', x: 95, y: 245, radius: 29 },
      { id: 'cohort', label: 'Cohort data', sub: '2,840 rows', type: 'source', x: 215, y: 395, radius: 29 },
      { id: 'sales', label: 'Sales notes', sub: '4 prospects', type: 'source', x: 685, y: 92, radius: 29 },
      { id: 'experiment', label: 'Template test', sub: '14 days', type: 'source', x: 680, y: 375, radius: 29 }
    ],
    edges: [
      { from: 'interviews', to: 'advocate', kind: 'supports' },
      { from: 'support', to: 'advocate', kind: 'supports' },
      { from: 'cohort', to: 'decision', kind: 'supports' },
      { from: 'advocate', to: 'decision', kind: 'supports' },
      { from: 'sales', to: 'skeptic', kind: 'challenges' },
      { from: 'cohort', to: 'skeptic', kind: 'challenges' },
      { from: 'skeptic', to: 'decision', kind: 'challenges' },
      { from: 'decision', to: 'strategist', kind: 'supports' },
      { from: 'strategist', to: 'experiment', kind: 'supports' }
    ]
  }
};
