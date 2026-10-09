export const defaultFactoryIdea = `Build a browser workflow agent that watches a user complete a repetitive browser task once, turns the recording into a reusable automation, and then runs it with checkpoints, approvals, and handoff notes.

Start with high-frequency operator workflows: lead enrichment, invoice reconciliation, customer onboarding checks, and weekly dashboard updates. The product must show the captured steps, inferred variables, failure checks, data boundaries, and a human approval gate before the workflow can run unattended.`;

export const artifactTeams = [
  {
    id: 'requirements',
    title: 'Product Requirements',
    team: 'PM, researcher, skeptic',
    promise: 'Define users, jobs, constraints, non-goals, and acceptance criteria.'
  },
  {
    id: 'flows',
    title: 'User Flows',
    team: 'UX designer, product strategist, accessibility reviewer',
    promise: 'Turn requirements into start-to-success journeys, states, and recovery paths.'
  },
  {
    id: 'data',
    title: 'Data Model',
    team: 'Backend architect, domain modeler, database reviewer',
    promise: 'Define durable entities, relationships, lifecycle states, and retention needs.'
  },
  {
    id: 'architecture',
    title: 'System Architecture',
    team: 'Staff engineer, infra architect, security reviewer',
    promise: 'Choose bounded services, agent runtime boundaries, storage, queues, and failure modes.'
  },
  {
    id: 'apis',
    title: 'API Contracts',
    team: 'Backend engineer, frontend engineer, integration tester',
    promise: 'Specify inputs, outputs, errors, auth, streaming, and idempotency.'
  },
  {
    id: 'ui',
    title: 'UI/UX Design',
    team: 'Product designer, design-system reviewer, usability tester',
    promise: 'Define screens, information hierarchy, empty states, progress, and review surfaces.'
  },
  {
    id: 'stack',
    title: 'Tech Stack',
    team: 'Engineering lead, cost reviewer, maintainability reviewer',
    promise: 'Pick boring defaults, model/provider strategy, and clear build-vs-buy choices.'
  },
  {
    id: 'security',
    title: 'Security Model',
    team: 'Security architect, privacy reviewer, abuse-case reviewer',
    promise: 'Define auth, permissions, secrets, sandboxing, data boundaries, and audit logs.'
  },
  {
    id: 'testing',
    title: 'Testing Strategy',
    team: 'QA lead, eval engineer, reliability reviewer',
    promise: 'Define unit, integration, E2E, visual, agent eval, and regression gates.'
  },
  {
    id: 'deployment',
    title: 'Deployment Plan',
    team: 'SRE, release manager, rollback reviewer',
    promise: 'Define environments, CI/CD, migrations, rollout, rollback, and release approvals.'
  },
  {
    id: 'observability',
    title: 'Observability',
    team: 'SRE, incident responder, analytics reviewer',
    promise: 'Define logs, metrics, traces, run replays, cost tracking, and alerting.'
  },
  {
    id: 'docs',
    title: 'Documentation',
    team: 'Technical writer, DX reviewer, onboarding tester',
    promise: 'Produce setup docs, architecture notes, API docs, runbooks, and user guides.'
  }
];

const compact = value => String(value || '').trim().replace(/\s+/g, ' ');

function inferProductName(idea) {
  const match = idea.match(/(?:called|named)\s+([A-Z][A-Za-z0-9 -]{2,32})/);
  if (match) return match[1].trim();
  if (/browser|workflow|record|watch/i.test(idea)) return 'Watch-to-Workflow Agent';
  if (/software factory/i.test(idea)) return 'Accountable Software Factory';
  if (/agent/i.test(idea)) return 'Agent Workbench';
  return 'Build-Ready Product Studio';
}

function inferAudience(idea) {
  if (/browser|workflow|operator|invoice|lead|onboarding/i.test(idea)) return 'founders, ops teams, revenue teams, and support teams doing repeated browser work';
  if (/enterprise|platform team|governance|security/i.test(idea)) return 'enterprise engineering leaders and platform teams';
  if (/founder|startup|product team/i.test(idea)) return 'founders, product leaders, and small engineering teams';
  if (/developer|engineer|repo|code/i.test(idea)) return 'software engineers and technical leads';
  return 'teams turning software ideas into production systems';
}

function inferPrimaryRisk(idea) {
  if (/browser|workflow|record|watch/i.test(idea)) return 'The agent may copy a happy-path recording but fail on messy pages, missing permissions, or changed data.';
  if (/replace|compet/i.test(idea)) return 'Trying to match mature agent platforms too broadly before proving one workflow.';
  if (/security|enterprise/i.test(idea)) return 'Trust and data-boundary concerns blocking adoption.';
  return 'Generating impressive artifacts that are not consistent enough to build from.';
}

function inferDifferentiator(idea) {
  if (/browser|workflow|record|watch/i.test(idea)) {
    return 'One human run becomes an inspectable workflow with variables, checks, approvals, and replay evidence.';
  }
  if (/promise|trace|govern|account/i.test(idea)) {
    return 'Every agent promise, artifact, test, and decision is assessed and mapped before work can ship.';
  }
  return 'The product reconciles specialist agent outputs into one consistent build package instead of separate documents.';
}

function makeArtifact(id, title, bullets, owner, status = 'ready') {
  return { id, title, bullets, owner, status };
}

export function generateFactoryBlueprint(rawIdea = defaultFactoryIdea) {
  const idea = compact(rawIdea) || compact(defaultFactoryIdea);
  const productName = inferProductName(idea);
  const audience = inferAudience(idea);
  const risk = inferPrimaryRisk(idea);
  const differentiator = inferDifferentiator(idea);

  const artifacts = [
    makeArtifact('requirements', 'Product Requirements', [
      `Target ${audience}.`,
      /browser|workflow|record|watch/i.test(idea)
        ? 'Core job: watch one successful browser run and convert it into a reusable automation.'
        : 'Core job: turn an ambiguous software idea into a build-ready, reviewed product package.',
      /browser|workflow|record|watch/i.test(idea)
        ? 'MVP scope: record steps, infer variables, add checks, ask for approval, and replay one workflow reliably.'
        : 'MVP scope: one idea input, coordinated artifact generation, conflict review, and exportable blueprint.',
      /browser|workflow|record|watch/i.test(idea)
        ? 'Non-goal: replacing complex RPA platforms or fully autonomous web browsing in v1.'
        : 'Non-goal: fully replacing human engineering execution in v1.'
    ], 'PM agent team'),
    makeArtifact('flows', 'User Flows', [
      /browser|workflow|record|watch/i.test(idea)
        ? 'Record run -> detect steps -> label variables -> add checks -> approve -> scheduled replay.'
        : 'Idea intake -> clarify assumptions -> generate artifact teams -> review conflicts -> approve build plan.',
      /browser|workflow|record|watch/i.test(idea)
        ? 'Reviewer flow: inspect every captured action, redact secrets, edit variables, and approve the runbook.'
        : 'Reviewer flow: open any artifact, inspect owner promises, request revision, or accept.',
      /browser|workflow|record|watch/i.test(idea)
        ? 'Failure flow: changed page, missing selector, low confidence, or unexpected data pauses for human handoff.'
        : 'Failure flow: unresolved conflict blocks finalization until scoped or waived.'
    ], 'UX agent team'),
    makeArtifact('data', 'Data Model', [
      'Workspace, product brief, artifact, agent team, promise, conflict, gate, run, decision, export.',
      'Artifacts link to source assumptions and downstream dependencies.',
      'Promises store expected behavior, evidence, assessment, and waiver state.'
    ], 'Data modeling team'),
    makeArtifact('architecture', 'System Architecture', [
      /browser|workflow|record|watch/i.test(idea)
        ? 'Browser recorder captures DOM actions, screenshots, network hints, and user labels into a workflow draft.'
        : 'Frontend review room backed by an orchestration API and artifact store.',
      /browser|workflow|record|watch/i.test(idea)
        ? 'RocketRide pipelines classify steps, infer variables, generate checks, and synthesize a replay plan.'
        : 'RocketRide pipelines coordinate specialist teams and final synthesis.',
      /browser|workflow|record|watch/i.test(idea)
        ? 'Replay worker runs in a sandbox with scoped credentials, approval gates, and failure handoff.'
        : 'Semantic graph service stores relationships between requirements, code plans, tests, and decisions.'
    ], 'Architecture team'),
    makeArtifact('apis', 'API Contracts', [
      'POST /blueprints creates a coordinated artifact run from a product idea.',
      'GET /blueprints/:id returns artifacts, promises, conflicts, readiness gates, and trace graph.',
      'POST /blueprints/:id/revise targets one artifact team with reviewer feedback.'
    ], 'API team'),
    makeArtifact('ui', 'UI/UX Design', [
      /browser|workflow|record|watch/i.test(idea)
        ? 'First screen shows Record, Review, Run: captured browser steps, variables, checks, and confidence.'
        : 'First screen is the factory console: idea input, agent lanes, readiness score, and final package.',
      /browser|workflow|record|watch/i.test(idea)
        ? 'Use tabs for Steps, Variables, Checks, Evidence, Replay Log, and Handoff.'
        : 'Use tabs for Blueprint, Promise Ledger, Semantic Map, and Build Queue.',
      /browser|workflow|record|watch/i.test(idea)
        ? 'Show paused runs as repairable work items, not vague automation errors.'
        : 'Show blockers as work items, not mysterious model failures.'
    ], 'Design team'),
    makeArtifact('stack', 'Tech Stack', [
      'TypeScript app, RocketRide orchestration, Postgres for durable state, graph table for semantic edges.',
      'Model routing remains provider-independent behind pipeline configuration.',
      'GitHub integration is the first execution target after blueprint generation.'
    ], 'Engineering lead team'),
    makeArtifact('security', 'Security Model', [
      'Workspace-scoped permissions, OAuth/SAML-ready identity, encrypted secrets, and audit logs.',
      'Agent sandboxes have explicit tool allowlists and repo/file boundaries.',
      'Release gates require security review for auth, data, billing, and deployment changes.'
    ], 'Security team'),
    makeArtifact('testing', 'Testing Strategy', [
      /browser|workflow|record|watch/i.test(idea)
        ? 'Golden workflow evals replay lead enrichment, invoice matching, and onboarding checks against fixture pages.'
        : 'Artifact consistency tests: every API appears in architecture, UI, and test plan.',
      /browser|workflow|record|watch/i.test(idea)
        ? 'Agent evals verify variable extraction, secret redaction, selector repair, and low-confidence pauses.'
        : 'Agent evals verify no unsupported claims, unresolved conflicts, or missing acceptance criteria.',
      /browser|workflow|record|watch/i.test(idea)
        ? 'E2E tests cover recording, review, approval, replay, failure, repair, and audit trail.'
        : 'E2E tests cover idea-to-blueprint, revision, approval, and export.'
    ], 'QA and eval team'),
    makeArtifact('deployment', 'Deployment Plan', [
      'Local-first development, preview environments per branch, production deploy behind feature flags.',
      'Migrations require dry-run output and rollback notes.',
      'Release is blocked until readiness gates pass or are explicitly waived.'
    ], 'SRE team'),
    makeArtifact('observability', 'Observability', [
      'Trace every agent run, artifact revision, promise assessment, cost, latency, and gate result.',
      'Factory run replay shows where work branched, conflicted, retried, or was waived.',
      'Dashboards track blueprint acceptance rate and downstream build success.'
    ], 'Observability team'),
    makeArtifact('docs', 'Documentation', [
      'README explains idea-to-blueprint setup and sample workflows.',
      'Architecture doc defines orchestration, promise ledger, semantic graph, and execution boundaries.',
      'Runbooks cover failed runs, bad artifacts, model outages, and release-blocking conflicts.'
    ], 'Docs team')
  ];

  const conflicts = [
    /browser|workflow|record|watch/i.test(idea)
      ? {
        title: 'Autonomy vs user trust',
        severity: 'high',
        resolution: 'Start with watched-run generation and approval gates; unattended schedules are enabled only after successful replays.'
      }
      : {
        title: 'Replacement ambition vs MVP scope',
        severity: 'high',
        resolution: 'Start with build-ready product blueprints, then add autonomous PR execution after the artifact contract is trusted.'
      },
    /browser|workflow|record|watch/i.test(idea)
      ? {
        title: 'Recorder simplicity vs robust replay',
        severity: 'medium',
        resolution: 'Capture DOM selectors, screenshots, labels, and fallback instructions so replay can pause or repair intelligently.'
      }
      : {
        title: 'Autonomy vs governance',
        severity: 'medium',
        resolution: 'Agents can draft and revise, but release gates require promise assessment and human approval in v1.'
      },
    /browser|workflow|record|watch/i.test(idea)
      ? {
        title: 'Speed vs data safety',
        severity: 'medium',
        resolution: 'Redact secrets during recording, scope credentials per workflow, and require approval before writing to external systems.'
      }
      : {
        title: 'Traceability vs user simplicity',
        severity: 'medium',
        resolution: 'Expose the simple factory console first; keep promise and semantic graphs one click deeper.'
      }
  ];

  const readinessGates = [
    { label: 'Artifact completeness', value: 12, total: 12, status: 'pass' },
    { label: 'Cross-team conflicts resolved', value: 3, total: 3, status: 'pass' },
    { label: 'Execution-ready backlog', value: 7, total: 10, status: 'warn' },
    { label: 'Enterprise controls', value: 6, total: 10, status: 'warn' }
  ];

  const promises = artifactTeams.map(team => ({
    agent: team.title,
    to: 'Factory orchestrator',
    body: team.promise,
    assessment: 'kept'
  }));

  return {
    productName,
    idea,
    audience,
    differentiator,
    finalOutcome: `${productName} should begin as a governed blueprint factory: it produces one coherent, build-ready software specification from a raw idea, with agent-team promises, conflict resolution, and verification gates visible before any code is written.`,
    primaryRisk: risk,
    artifacts,
    conflicts,
    readinessGates,
    promises,
    nextBuildQueue: [
      /browser|workflow|record|watch/i.test(idea) ? 'Build Chrome recorder and step review UI.' : 'Persist generated blueprints and revisions.',
      /browser|workflow|record|watch/i.test(idea) ? 'Add RocketRide step-classifier and check-generator pipeline.' : 'Add RocketRide live pipeline for artifact teams.',
      /browser|workflow|record|watch/i.test(idea) ? 'Ship replay sandbox for one lead-enrichment workflow.' : 'Export blueprint as markdown and GitHub issues.',
      /browser|workflow|record|watch/i.test(idea) ? 'Add run logs, approval gates, and handoff notes.' : 'Add PR execution agent for one scoped artifact.'
    ]
  };
}
