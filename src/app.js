import { normalizeReport } from './report.js';
import { scenarioLibrary, getScenario } from './scenarios.js';
import { verifyReportProofs } from './proof-verification.js';
import { roleFor } from './promise-judge.js';

const $ = selector => document.querySelector(selector);
let selectedScenario = scenarioLibrary[0];
let currentReport = selectedScenario.report;
let toastTimer;
let localLiveReport;
let tourIndex = 0;
let displayedSources = [];
let stagedEvidenceText = '';
let stagedEvidenceFiles = [];
let attachedFiles = [];
let proofMode = true;
let currentMission;
let executionPoll;
let scopeReportReady = false;
let currentRunId;
const rocketRidePipeline = [
  { label: 'Read sources', detail: 'processing', type: 'step' },
  { label: 'Customer Advocate', detail: 'specialist role', type: 'role' },
  { label: 'Skeptic', detail: 'specialist role', type: 'role' },
  { label: 'Product Strategist', detail: 'specialist role', type: 'role' },
  { label: 'Promise Judge', detail: 'independent review', type: 'role' },
  { label: 'Synthesize', detail: 'reconcile', type: 'step' },
  { label: 'Check commitments', detail: 'validate', type: 'step' },
  { label: 'Link proof', detail: 'trace', type: 'step' }
];

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function sourceKindLabel(source) {
  // A person-named source is evidence, not a RocketRide specialist role.
  return String(source.kind || 'SOURCE').toUpperCase() === 'AGENT' ? 'CALL' : String(source.kind || 'SOURCE').toUpperCase();
}

function renderAttachmentList() {
  const list = $('#attachmentList');
  const items = $('#attachmentListItems');
  list.hidden = attachedFiles.length === 0;
  items.innerHTML = attachedFiles.map(file => `
    <li class="attachment-file ${escapeHtml(file.status)}">
      <span>${escapeHtml(file.name)}</span>
      <small>${escapeHtml(file.detail)}</small>
    </li>
  `).join('');
}

function missionTitleFromRequest(request) {
  const firstLine = String(request).split(/\n|[.!?]/)[0].trim().replace(/^(build|create|make)\s+/i, '');
  if (!firstLine) return 'Microapp request';
  if (firstLine.length <= 72) return firstLine;
  return `${firstLine.slice(0, 72).replace(/\s+\S*$/, '')}…`;
}

function renderPreparedInputs() {
  const request = $('#factoryIdeaInput').value.trim();
  const stagedFiles = displayedSources.filter(source => source.contentStatus === 'staged');
  $('#factoryProductName').textContent = 'Request staged locally';
  $('#factoryOutcome').textContent = 'No scope, requirements, risks, or technical plan has been generated yet.';
  $('#factoryAudienceLabel').textContent = 'Product request';
  $('#factoryAudience').textContent = 'Ready to send';
  $('#factoryDifferentiatorLabel').textContent = 'Attached context';
  $('#factoryDifferentiator').textContent = stagedFiles.length ? `${stagedFiles.length} file${stagedFiles.length === 1 ? '' : 's'} staged` : 'None attached';
  $('#factoryRiskLabel').textContent = 'Next step';
  $('#factoryRisk').textContent = 'Run RocketRide scope workflow';
  $('#factoryArtifactCount').textContent = stagedFiles.length ? '02' : '01';
  $('#localBriefRequest').textContent = request;
  $('#localBriefContext').textContent = stagedFiles.length
    ? stagedFiles.map(source => source.name).join(', ')
    : 'No files attached. RocketRide will analyze the product request only.';
  $('#missionScope').textContent = 'Await an approved RocketRide decision before preparing an implementation mission.';
}

function renderFactoryEmpty() {
  $('#factorySummaryPanel').hidden = true;
  $('#factoryArtifactCount').textContent = '00';
  $('#localBriefRequest').textContent = '';
  $('#localBriefContext').textContent = '';
  attachedFiles = [];
  stagedEvidenceFiles = [];
  renderAttachmentList();
  $('#scopeRunNotice').hidden = true;
  $('.factory-output').hidden = true;
  $('#buildMission').hidden = true;
  $('#missionState').classList.remove('created');
  $('#missionState').innerHTML = '<i></i><span>Decision required first</span>';
  $('#missionName').textContent = 'Build mission not created';
  $('#missionDescription').textContent = 'This handoff stays local to the browser until a repository and coding-agent integration are connected.';
  $('#createMissionButton').disabled = true;
  $('#createMissionButton').innerHTML = '<span>✓</span> Build mission prepared';
  $('#createMissionReviewButton').disabled = false;
  $('#createMissionReviewButton').innerHTML = '<span class="button-spark">↗</span><span>Create build mission</span>';
  currentMission = undefined;
  currentRunId = undefined;
  scopeReportReady = false;
}

function focusFactoryInput() {
  document.querySelector('.factory-console').scrollIntoView({ behavior: 'smooth', block: 'center' });
  window.setTimeout(() => $('#factoryIdeaInput').focus(), 350);
}

function syncScopeAction() {
  const hasRequest = Boolean($('#factoryIdeaInput').value.trim());
  $('#factoryGenerateButton').disabled = !hasRequest;
  $('#requestValidation').classList.toggle('ready', hasRequest);
}

async function runFactoryPlan() {
  const input = $('#factoryIdeaInput');
  if (!input.value.trim()) {
    input.focus();
    showToast('Describe the mission outcome before drafting a brief.');
    return;
  }

  const button = $('#factoryGenerateButton');
  const original = button.innerHTML;
  button.disabled = true;
  button.textContent = 'Preparing inputs';
  $('.factory-output').hidden = true;

  currentMission = {
    title: missionTitleFromRequest(input.value),
    brief: input.value.trim()
  };
  scopeReportReady = false;
  renderPreparedInputs();
  $('#factorySummaryPanel').hidden = false;
  $('.factory-output').hidden = false;
  $('#buildMission').hidden = true;
  button.disabled = false;
  button.innerHTML = original;
  document.querySelector('.factory-output').scrollIntoView({ behavior: 'smooth', block: 'start' });
  showToast('Inputs staged locally. Run RocketRide to generate the scope report.');
  return currentMission;
}

function createBuildMission(event) {
  if (!currentMission || !scopeReportReady) {
    showToast('Run the live RocketRide scope workflow before creating a build mission.');
    return;
  }
  const button = $('#createMissionButton');
  const reviewButton = event?.currentTarget;
  currentMission = {
    ...currentMission,
    schemaVersion: 1,
    runId: currentRunId,
    scopeReportId: currentReport.reportId,
    recommendation: currentReport.recommendation,
    contradiction: currentReport.contradiction,
    experiment: currentReport.experiment,
    acceptanceCriteria: [
      `Implement the approved recommendation: ${currentReport.recommendation.title}`,
      `Preserve the primary constraint: ${currentReport.contradiction.title}`,
      `Make the result measurable using: ${currentReport.experiment.metric}`,
      'Run the repository test and build commands successfully before review.'
    ],
    evidence: currentReport.proofs.map(proof => ({
      claim: proof.claim,
      sourceId: proof.sourceId,
      sourceName: proof.sourceName,
      verification: proof.verification?.status || 'source-unavailable'
    }))
  };
  $('#missionState').classList.add('created');
  $('#missionState').innerHTML = '<i></i><span>Mission prepared for a repository</span>';
  $('#missionName').textContent = `${currentMission.title} / mission prepared`;
  $('#missionDescription').textContent = 'The brief, build queue, risk, and verification gates are packaged. With a configured trusted repository, Signal creates an isolated branch, dispatches the coding agent, runs tests and build, then opens a reviewable pull request.';
  button.disabled = true;
  button.innerHTML = '<span>✓</span> Build mission prepared';
  if (reviewButton) {
    reviewButton.disabled = true;
    reviewButton.textContent = 'Build mission prepared';
  }
  document.querySelectorAll('.mission-stages li').forEach((stage, index) => {
    stage.classList.toggle('prepared', index === 0);
  });
  $('#buildMission').hidden = false;
  $('#buildMission').scrollIntoView({ behavior: 'smooth', block: 'center' });
  prepareExecutionStatus().then(config => {
    if (config?.prMode === 'local review branch') {
      $('#missionDescription').textContent = 'The brief, build queue, risk, and verification gates are packaged. Signal creates an isolated branch, dispatches the coding agent, runs tests and build, then pushes a local review branch.';
    }
    showToast(config?.enabled
    ? `Build mission prepared. Run implementation to hand it to ${config.runnerName} on ${config.repo}.`
    : 'Build mission prepared. Connect a repository to hand this bounded task to a coding agent.', 6200);
  });
}

const executionPhaseOrder = ['preflight', 'implementing', 'testing', 'delivery-review', 'opening-pr'];
const executionPhaseIndex = { 'delivery-review-failed': 3, 'review-ready': 4, complete: 5 };

function setExecutionState(execution) {
  const status = execution?.status || 'disabled';
  const phaseCopy = {
    ready: 'Ready to run on the trusted repository.',
    queued: 'Queued',
    preflight: 'Checking repository',
    implementing: 'Coding runner is working',
    testing: 'Running quality gates',
    'delivery-review': 'RocketRide is assessing the tested delivery',
    'delivery-review-failed': 'RocketRide delivery review was unavailable',
    'review-ready': 'Committing tested change',
    'opening-pr': 'Opening pull request',
    complete: 'Ready for human review',
    failed: 'Execution failed',
    disabled: 'Execution is disabled until a trusted repository is configured.'
  };
  // The furthest phase this run reached, so a failure keeps completed stages visible.
  const reached = Math.max(-1, ...(execution?.logs || []).map(event => executionPhaseIndex[event.phase] ?? executionPhaseOrder.indexOf(event.phase)));
  const current = status === 'failed' ? reached : executionPhaseIndex[status] ?? executionPhaseOrder.indexOf(status);
  $('#executionState').textContent = execution?.detail || phaseCopy[status] || status;
  $('#executionPr').textContent = execution?.prUrl
    ? 'Ready for review'
    : execution?.reviewBranch || (status === 'opening-pr' ? 'Creating' : 'Not created');
  $('#executionTests').textContent = current > 2 ? 'Passed' : status === 'failed' && reached === 2 ? 'Failed' : 'Tests + build';
  document.querySelectorAll('.mission-stages li').forEach((stage, index) => {
    stage.classList.toggle('prepared', index === 0 || (index === 1 && current >= 1) || (index === 2 && current > 2) || (index === 3 && status === 'complete'));
  });
  document.querySelectorAll('[data-execution-phase]').forEach((item, index) => {
    item.classList.toggle('complete', status === 'complete' || index < current);
    item.classList.toggle('active', index === current && !['complete', 'failed'].includes(status));
    item.classList.toggle('failed', status === 'failed' && index === current);
  });
  renderDeliveryReview(execution?.deliveryReview);
}

const verdictCopy = { ready: 'READY FOR REVIEW', 'needs-review': 'NEEDS REVIEW', blocked: 'BLOCKED' };

function renderCitations(finding) {
  if (!finding.citations?.length) return '<span class="citation-note">No line citation</span>';
  return finding.citations.map(citation => `<code class="citation ${finding.citationVerified ? 'verified' : 'unverified'}">${escapeHtml(citation)}</code>`).join('')
    + `<span class="citation-note">${finding.citationVerified ? 'found in the actual diff' : 'not found in the actual diff'}</span>`;
}

function renderDeliveryReview(review) {
  const panel = $('#deliveryReviewPanel');
  if (!review) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }
  const findings = [
    ...(review.checks || []).map(check => ({ ...check, title: check.name, status: check.status, statusLabel: check.status })),
    ...(review.risks || []).map(risk => ({ ...risk, status: risk.severity, statusLabel: `${risk.severity} risk` }))
  ];
  const steps = review.provenance?.trace || [];
  const agent = review.agent;
  const diffCall = agent?.calls?.find(call => call.tool === 'diff');
  const agentBox = agent && diffCall ? `
    <div class="agent-call">
      <span>agent_rocketride → read-only tool_git</span>
      <code>git.diff(${escapeHtml(String(diffCall.refA || '').slice(0, 7))}..${escapeHtml(String(diffCall.refB || '').slice(0, 7))})</code>
      <small>commit ${escapeHtml(agent.commit.short)}${agent.commit.subject ? ` · "${escapeHtml(agent.commit.subject)}"` : ''}</small>
      <b>→ files changed: ${escapeHtml(diffCall.filesChanged)} · +${escapeHtml(diffCall.insertions)} · −${escapeHtml(diffCall.deletions)}</b>
      <em class="${agent.matchesCommit ? 'verified' : 'unverified'}">${agent.matchesCommit ? 'Matches the commit Signal recorded' : `Does not match the recorded commit (${escapeHtml(agent.commitStats.filesChanged)} files · +${escapeHtml(agent.commitStats.insertions)} · −${escapeHtml(agent.commitStats.deletions)})`}</em>
    </div>` : '';
  panel.innerHTML = `
    <div class="delivery-review-head">
      <div>
        <span class="eyebrow">delivery-review.pipe · live run</span>
        <h3>An agent read the real diff</h3>
        <p>${escapeHtml(review.summary || '')}</p>
        ${agentBox}
      </div>
      <div class="delivery-verdict ${escapeHtml(review.verdict)}">
        <span>Verdict</span>
        <strong>${escapeHtml(verdictCopy[review.verdict] || review.verdict)}</strong>
        <small>The best verdict is "ready for human review". It never approves a release.</small>
      </div>
    </div>
    <ul class="delivery-findings">${findings.map(finding => `
      <li>
        <div><strong>${escapeHtml(finding.title)}</strong><p>${escapeHtml(finding.detail || '')}</p>${renderCitations(finding)}</div>
        <span class="finding-status ${escapeHtml(finding.status)}">${escapeHtml(finding.statusLabel)}</span>
      </li>`).join('')}
    </ul>
    ${steps.length ? `<p class="delivery-engine">Executed by RocketRide: ${steps.map(step => escapeHtml(step.label)).join(' → ')} · ${formatSeconds(review.provenance.engineDurationMs)}</p>` : ''}
  `;
  panel.hidden = false;
}

function setFactoryRoleState(status = 'idle') {
  const copy = {
    idle: 'Awaiting a scope run',
    running: 'RocketRide is running the scope workflow',
    complete: 'Scope report ready for human review',
    failed: 'Scope run stopped before a report was produced'
  };
  const state = $('#factoryRunState');
  if (state) state.textContent = copy[status] || copy.idle;
  document.querySelectorAll('[data-factory-role]').forEach(item => {
    item.classList.toggle('working', status === 'running');
    item.classList.toggle('complete', status === 'complete');
    item.classList.toggle('blocked', status === 'failed');
  });
}

async function prepareExecutionStatus() {
  try {
    const response = await fetch('/api/execution-status', { cache: 'no-store' });
    const config = await response.json();
    const localReview = config.prMode === 'local review branch';
    $('#executionRepo').textContent = config.repo || 'Not connected';
    $('#executionRunner').textContent = config.enabled ? `Coding agent (${config.runnerName || 'Claude Code'})` : 'Not enabled';
    $('#executionDeliveryReview').textContent = config.deliveryReviewEnabled
      ? `${config.deliveryReviewRequired ? 'Required' : 'Enabled'} before ${localReview ? 'review branch' : 'PR'}`
      : 'Not enabled';
    $('#executionDescription').textContent = config.message;
    $('#dispatchExecutionButton').disabled = !config.enabled || !currentMission || !scopeReportReady;
    $('#executionPrLabel').textContent = localReview ? 'Review branch' : 'Pull request';
    $('#executionTitle').textContent = localReview ? 'Code, test, and review branch' : 'Code, test, and pull request';
    $('#openReviewDetail').textContent = localReview ? 'Commit the tested diff and push a local review branch.' : 'Commit the tested diff and open a pull request.';
    setExecutionState(config.enabled ? { status: 'ready' } : undefined);
    return config;
  } catch {
    $('#executionDescription').textContent = 'Execution status is unavailable. Start Signal through the local server to connect a trusted repository.';
    $('#dispatchExecutionButton').disabled = true;
  }
}

async function pollExecution(id) {
  clearInterval(executionPoll);
  const poll = async () => {
    try {
      const response = await fetch(`/api/executions/${id}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'Could not read execution status.');
      setExecutionState(payload.execution);
      if (['complete', 'failed'].includes(payload.execution.status)) {
        clearInterval(executionPoll);
        $('#dispatchExecutionButton').disabled = false;
        if (payload.execution.prUrl) $('#executionState').innerHTML = `Pull request ready: <a href="${escapeHtml(payload.execution.prUrl)}" target="_blank" rel="noreferrer">open review</a>`;
      }
    } catch (error) {
      clearInterval(executionPoll);
      $('#executionState').textContent = error.message;
      $('#dispatchExecutionButton').disabled = false;
    }
  };
  await poll();
  executionPoll = setInterval(poll, 1800);
}

async function dispatchExecution() {
  if (!currentMission || !scopeReportReady) {
    showToast('Create a build mission from a live RocketRide scope report before dispatching implementation.');
    return;
  }
  const button = $('#dispatchExecutionButton');
  button.disabled = true;
  setExecutionState({ status: 'queued', detail: 'Sending the approved build mission to the trusted local runner.' });
  try {
    const response = await fetch('/api/execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mission: currentMission })
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.message || payload.message || 'Could not start implementation.');
    showToast('Implementation run started. Signal will report test and pull-request status here.', 6000);
    pollExecution(payload.execution.id);
  } catch (error) {
    $('#executionState').textContent = error.message;
    button.disabled = false;
  }
}

function renderConnections(runners) {
  const list = $('#connectionList');
  list.innerHTML = runners.map(runner => {
    const state = !runner.installed ? 'unavailable' : runner.connected ? 'connected' : 'disconnected';
    const stateLabel = !runner.installed ? 'Not installed' : runner.connected ? 'Connected' : 'Sign-in needed';
    const capability = runner.availableForBuilds
      ? 'Available for Signal build missions.'
      : 'Signed in, but this Signal server sends build missions to the other coding agent.';
    return `
      <article class="connection-row">
        <div>
          <div class="connection-title"><strong>${escapeHtml(runner.name)}</strong><span class="connection-state ${state}">${stateLabel}</span></div>
          <p>${escapeHtml(runner.detail)}</p>
          <small>${escapeHtml(capability)}</small>
        </div>
        <button class="button button-ghost" type="button" data-runner-login="${escapeHtml(runner.id)}" ${runner.installed && !runner.connected ? '' : 'disabled'}>${runner.connected ? 'Connected' : 'Sign in'}</button>
      </article>
    `;
  }).join('');
  document.querySelectorAll('[data-runner-login]').forEach(button => {
    button.addEventListener('click', () => beginRunnerLogin(button.dataset.runnerLogin));
  });
}

async function refreshConnections() {
  const state = $('#connectionsState');
  state.textContent = 'Checking local runners…';
  try {
    const response = await fetch('/api/runners', { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || 'Could not read local runner status.');
    renderConnections(payload.runners);
    const connected = payload.runners.filter(runner => runner.connected).length;
    state.textContent = `${connected} of ${payload.runners.length} local runners connected.`;
  } catch (error) {
    state.textContent = error.message;
    $('#connectionList').replaceChildren();
  }
}

async function beginRunnerLogin(runner) {
  const button = document.querySelector(`[data-runner-login="${runner}"]`);
  if (button) {
    button.disabled = true;
    button.textContent = 'Opening Terminal';
  }
  try {
    const response = await fetch(`/api/runners/${encodeURIComponent(runner)}/login`, { method: 'POST' });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.message || 'Could not start local sign-in.');
    $('#connectionsState').textContent = payload.message;
    showToast('Terminal opened for secure sign-in. Return here and refresh status when it is complete.', 7000);
  } catch (error) {
    $('#connectionsState').textContent = error.message;
    if (button) {
      button.disabled = false;
      button.textContent = 'Sign in';
    }
  }
}

function renderSources(sources) {
  displayedSources = sources;
  const stagedFiles = sources.filter(source => source.contentStatus === 'staged');
  const contextHint = $('#contextHint');
  if (stagedFiles.length) {
    contextHint.textContent = `${stagedFiles.length} file${stagedFiles.length === 1 ? '' : 's'} will be included in this scope workflow.`;
  } else {
    contextHint.textContent = 'Add a brief, spec, notes, or data that the scope workflow must consider. Text, Markdown, JSON, JSONL, CSV, and XLSX are supported.';
  }
}

function setScopeRunNotice(message = '', state = '') {
  const notice = $('#scopeRunNotice');
  notice.hidden = !message;
  notice.textContent = message;
  notice.className = `scope-run-notice ${state}`.trim();
}

function renderScenarioOutcome(scenario) {
  $('#scenarioOutcomeTitle').textContent = scenario.expectedTitle;
  $('#scenarioOutcomeBody').textContent = scenario.expectedBody;
  $('#scenarioDecisionType').textContent = scenario.decisionType;
  $('#scenarioRisk').textContent = scenario.risk;
  $('#scenarioEvidenceMix').textContent = scenario.evidenceMix;
}

function renderScenarios() {
  $('#scenarioList').innerHTML = scenarioLibrary.map(scenario => `
    <button class="scenario-card ${scenario.id === selectedScenario.id ? 'active' : ''}" type="button" data-scenario-id="${escapeHtml(scenario.id)}">
      <strong>${escapeHtml(scenario.title)}</strong>
      <span>${escapeHtml(scenario.summary)}</span>
    </button>
  `).join('');

  document.querySelectorAll('.scenario-card').forEach(button => {
    button.addEventListener('click', () => selectScenario(button.dataset.scenarioId, { announce: true }));
  });
}

function selectScenario(id, options = {}) {
  selectedScenario = getScenario(id);
  stagedEvidenceText = selectedScenario.evidenceText;
  stagedEvidenceFiles = [];
  renderScenarioOutcome(selectedScenario);
  renderReport(normalizeReport(verifyReportProofs(selectedScenario.report)));
  setProofMode(true);
  renderScenarios();
  $('#truthBanner').hidden = false;
  $('#truthBanner').className = 'truth-banner demo';
  $('.truth-badge').textContent = 'SEED';
  $('.truth-banner p').innerHTML = '<strong>This is a deterministic seed scenario.</strong> Use it to demo expected outcomes, or run the same evidence through RocketRide from the CLI.';
  if (options.announce) {
    showToast(`Loaded ${selectedScenario.title}. The evidence is staged for Run RocketRide.`, 5200);
    scrollToReview();
  }
}

function scrollToReview() {
  $('#reviewWorkspace').hidden = false;
  $('#reviewWorkspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function relatedSignalsFor(source) {
  const name = source.name.toLowerCase();
  return currentReport.signals.filter(signal => {
    const label = signal.sourceLabel.toLowerCase();
    return label.length > 3 && (name.includes(label) || label.includes(name.split(' — ')[0]));
  });
}

function openEvidenceSource(source) {
  if (!source) return;
  const statusCopy = {
    full: 'Full source text preserved from the evidence bundle supplied to RocketRide.',
    fixture: 'Illustrative demo-fixture content—not a live customer record.',
    staged: 'Local browser file. It is readable here but has not been analyzed.',
    metadata: 'This report contains source metadata only; the original source text was not embedded.'
  };
  const related = relatedSignalsFor(source);
  $('#sourceDialogKind').textContent = `${sourceKindLabel(source)} · ${source.meta}`;
  $('#sourceDialogTitle').textContent = source.name;
  $('#sourceDialogProvenance').textContent = statusCopy[source.contentStatus] || statusCopy.metadata;
  $('#sourceDialogProvenance').className = `source-provenance ${source.contentStatus || 'metadata'}`;
  $('#sourceDialogContent').textContent = source.content || 'No source content is available in this report.';
  $('#sourceDialogSignals').innerHTML = related.length
    ? related.map(signal => `<article><b>${escapeHtml(signal.index)}</b><span><strong>${escapeHtml(signal.title)}</strong><small>${escapeHtml(signal.body)}</small></span></article>`).join('')
    : '<p>No signal in this report names this source directly.</p>';
  document.querySelectorAll('.source-item').forEach(button => {
    button.classList.toggle('active', displayedSources[Number(button.dataset.sourceIndex)]?.id === source.id);
  });
  $('#sourceDialog').showModal();
}

function renderSignals(signals) {
  $('#signalsSection').hidden = signals.length === 0;
  $('#signalList').innerHTML = signals.map(signal => `
    <article class="signal-card reveal-card">
      <div class="signal-top"><span>${escapeHtml(signal.index)}</span><b>${escapeHtml(signal.strength)}</b></div>
      <h3>${escapeHtml(signal.title)}</h3>
      <p>${escapeHtml(signal.body)}</p>
      <div class="signal-sources">
        ${signal.people.map(person => `<span class="mini-avatar">${escapeHtml(person)}</span>`).join('')}
        <span>${escapeHtml(signal.sourceLabel)}</span>
      </div>
    </article>
  `).join('');
  $('#signalCount').textContent = `${String(signals.length).padStart(2, '0')} signals`;
}

function renderPipeline(pipeline, state = 'done') {
  $('#pipeline').innerHTML = pipeline.map((step, index) => `
    <div class="pipeline-node ${escapeHtml(step.type || 'step')} ${state === 'done' ? 'done' : index === 0 ? 'processing' : ''}" data-index="${index}">
      <div class="node-box">${escapeHtml(step.label)}</div>
      <span>${escapeHtml(step.type === 'role' ? 'specialist role' : step.detail)}</span>
    </div>
  `).join('');
}

const promiseGraderCopy = {
  applied: 'Graded by the independent Promise Judge (GPT-4o). Signal read these verdicts from the judge\'s own RocketRide output, not from the synthesizer.',
  unavailable: 'The Promise Judge output could not be read for this run, so these grades are the synthesizer\'s restatement.',
  'not-recorded': 'This report predates judge capture; these grades are the synthesizer\'s restatement.'
};

function renderPromises(promises, judge = {}) {
  $('#promiseLedger').innerHTML = promises.map(promise => `
    <article class="promise-row assessed">
      <div class="promise-agent"><i>${escapeHtml(promise.initials)}</i><div><strong>${escapeHtml(promise.agent)}</strong><span>promiser</span></div></div>
      <span class="promise-arrow">→</span>
      <div class="promise-body"><strong>${escapeHtml(promise.body)}</strong><small>to ${escapeHtml(promise.to)} · ${escapeHtml(promise.evidence)}</small>${promise.reason ? `<small class="promise-reason">Judge: ${escapeHtml(promise.reason)}</small>` : ''}</div>
      <span class="assessment ${escapeHtml(promise.assessment)}">${escapeHtml(promise.assessment)}</span>
    </article>
  `).join('') || '<div class="promise-row"><div class="promise-body"><strong>No promise ledger was included in this report.</strong></div></div>';
  const kept = promises.filter(promise => promise.assessment === 'kept').length;
  $('#promiseKept').textContent = kept;
  $('.promise-score span').textContent = `/ ${promises.length} kept`;
  $('.view-tabs [data-view="promiseView"] span').textContent = String(promises.length).padStart(2, '0');
  const disagreements = (judge.disagreements || []).map(item => `${item.agent}: synthesizer said ${item.synthesizer}, judge said ${item.judge}`);
  $('#promiseGrader').textContent = [promiseGraderCopy[judge.status] || promiseGraderCopy['not-recorded'], disagreements.length ? `Overruled synthesizer: ${disagreements.join('; ')}.` : ''].filter(Boolean).join(' ');
}

function findProofSource(proof) {
  return currentReport.sources.find(source => source.id === proof.sourceId)
    || currentReport.sources.find(source => source.name === proof.sourceName)
    || currentReport.sources.find(source => source.name.toLowerCase().includes(String(proof.sourceName || '').toLowerCase()));
}

// Only a quote found in the parsed source (or a labelled, grounded paraphrase)
// may carry the role's supported/challenged status; anything else is flagged.
const proofVerificationCopy = {
  'not-found': 'quote not found in the parsed source',
  'source-unavailable': 'source text unavailable'
};

function quoteVerified(proof) {
  return ['verbatim', 'paraphrase'].includes(proof?.verification?.status);
}

function renderProofs(proofs = []) {
  $('#proofCount').textContent = `${String(proofs.length).padStart(2, '0')} claims`;
  $('#proofList').innerHTML = proofs.length
    ? proofs.map((proof, index) => `
      <button class="proof-item ${quoteVerified(proof) ? escapeHtml(proof.status) : 'unverified'}" type="button" data-proof-index="${index}">
        <span>${quoteVerified(proof) ? `${escapeHtml(proof.status)} · ${escapeHtml(proof.verification.status)}` : `unverified · ${escapeHtml(proofVerificationCopy[proof.verification?.status] || 'quote not checked')}`}</span>
        <strong>${escapeHtml(proof.claim)}</strong>
        <small>${escapeHtml(proof.agent)} · ${escapeHtml(proof.sourceName || proof.sourceId || 'source')}</small>
        <q>${escapeHtml(proof.quote)}</q>
      </button>
    `).join('')
    : '<p class="proof-empty">This report did not include proof claims. Import a newer live report or rerun RocketRide.</p>';

  document.querySelectorAll('.proof-item').forEach(button => {
    button.addEventListener('click', () => {
      const proof = currentReport.proofs[Number(button.dataset.proofIndex)];
      const source = findProofSource(proof);
      if (source) openEvidenceSource(source);
    });
  });
}

function engineTraceOf(report) {
  const trace = report?.provenance?.trace;
  return Array.isArray(trace) && trace.length && trace.every(step => typeof step?.label === 'string' && Number.isFinite(step?.startMs)) ? trace : [];
}

function formatSeconds(ms) {
  return `${(Number(ms || 0) / 1000).toFixed(1)}s`;
}

function renderExecutionTrace(report) {
  const steps = engineTraceOf(report);
  const events = steps.length
    ? steps.map(step => ({ title: step.label, detail: [`+${formatSeconds(step.startMs)}`, `ran ${formatSeconds(step.durationMs)}`, `${step.events} lane events`, step.error].filter(Boolean).join(' · ') }))
    : (report.pipeline || []).map(step => ({ title: step.label, detail: step.detail }));
  $('#traceBody').innerHTML = '<div class="trace-line"></div>' + events.map((event, index) => `
    <div class="trace-event ${index === events.length - 1 ? 'is-final' : ''}">
      <b>${String(index + 1).padStart(2, '0')}</b>
      <div><span>${escapeHtml(event.title)}</span><p>${escapeHtml(event.detail || 'Declared step')}</p></div>
    </div>
  `).join('');
  $('#traceProvenance').textContent = steps.length
    ? `Live RocketRide trace · ${report.provenance.flowEventCount || 0} flow events · ${formatSeconds(report.provenance.engineDurationMs)}`
    : 'Steps declared by the report — no engine event trace was embedded';
  $('#traceLevel').textContent = `pipelineTraceLevel: ${report.provenance?.pipelineTraceLevel || 'none'}`;
}

// The workflow strip and timeline come from RocketRide flow events when the
// report carries them; otherwise the strip shows the declared steps only.
function renderEngineTrace(report) {
  const steps = engineTraceOf(report);
  const isLive = report.mode === 'live';
  if (!steps.length) {
    renderPipeline(isLive ? rocketRidePipeline : report.pipeline, 'done');
    $('#runtimeLabel').textContent = isLive ? 'declared steps · no engine trace' : 'demo result';
    $('#engineTimeline').hidden = true;
    return;
  }
  const total = Math.max(Number(report.provenance.engineDurationMs) || 0, ...steps.map(step => step.startMs + step.durationMs), 1);
  renderPipeline(steps.map(step => ({ label: step.label, detail: `+${formatSeconds(step.startMs)}`, type: step.kind === 'role' ? 'role' : 'step' })), 'done');
  $('#runtimeLabel').textContent = `executed by RocketRide · ${formatSeconds(total)}`;
  $('#engineTimelineLabel').textContent = `${formatSeconds(total)} · ${report.provenance.flowEventCount || 0} RocketRide flow events`;
  $('#engineTimelineRows').innerHTML = steps.map(step => `
    <li>
      <span>${escapeHtml(step.label)}</span>
      <div class="timeline-track"><i style="left:${(step.startMs / total * 100).toFixed(2)}%;width:${Math.max(0.8, step.durationMs / total * 100).toFixed(2)}%"></i></div>
      <em>+${formatSeconds(step.startMs)}</em>
    </li>
  `).join('');
  $('#engineTimeline').hidden = false;
}

function parseMarkdownTable(markdown) {
  return String(markdown).split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('|') && !/^\|[\s:|-]+\|$/.test(line))
    .map(line => line.replace(/^\||\|$/g, '').split('|').map(cell => cell.trim()));
}

// Tables come from RocketRide's parse node (its `table` lane), recorded when
// the run parsed each uploaded file from its raw bytes.
function renderParsedSheets(report) {
  const sheets = (report.parsedEvidence || []).flatMap(file => (file.tables || []).map(table => ({ file, rows: parseMarkdownTable(table) })))
    .filter(sheet => sheet.rows.length > 1);
  const panel = $('#parsedEvidence');
  if (!sheets.length) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }
  panel.innerHTML = sheets.map(({ file, rows }) => {
    const [header, ...body] = rows;
    const columns = header.slice(0, 7);
    return `
      <div class="parsed-sheet">
        <div class="pipeline-title">
          <strong>Parsed by RocketRide</strong>
          <span>${escapeHtml(file.name)} · ${body.length} rows</span>
        </div>
        <p>RocketRide's parse node read this file from its raw bytes; the specialist roles cited exactly this text.</p>
        <div class="parsed-table-wrap">
          <table>
            <thead><tr>${columns.map(column => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead>
            <tbody>${body.slice(0, 8).map(cells => `<tr>${columns.map((_, index) => `<td>${escapeHtml(cells[index] || '')}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
        </div>
      </div>
    `;
  }).join('');
  panel.hidden = false;
}

function wrapNodeLabel(text, maxChars, maxLines) {
  const lines = [];
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const last = lines.at(-1);
    if (last !== undefined && `${last} ${word}`.length <= maxChars) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word.length > maxChars ? `${word.slice(0, maxChars - 1)}…` : word);
  }
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1].slice(0, maxChars - 1)}…`;
  return kept;
}

function displayTraceLabel(value, fallback, maxWords = 3) {
  const words = String(value || fallback).replace(/[^a-zA-Z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, maxWords).join(' ') || fallback;
}

// Every edge drawn here was declared: either in the report's semantic map or by
// a proof claim (source → the role that used it). Nothing is inferred from a
// role's name, and roles or sources without a declared edge are not drawn.
function buildDecisionTraceMap(report) {
  const sanitize = value => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  const sources = report.sources || [];
  const sourceMatch = value => sources.find(source => [source.id, sanitize(source.id), source.name].includes(value));
  const roleId = role => `agent_${role.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
  const canonical = node => {
    if (!node) return null;
    if (node.type === 'decision' || node.id === 'decision') return { id: 'decision' };
    if (node.type === 'agent') {
      const role = roleFor(node.label) || roleFor(node.id);
      return role ? { id: roleId(role), role } : null;
    }
    const source = sourceMatch(node.id) || sourceMatch(node.label);
    return source ? { id: `source_${source.id}`, source } : null;
  };
  const declaredNodes = new Map((report.semanticMap?.nodes || []).map(node => [node.id, canonical(node)]));
  const allowed = (from, to) => (from.source && (to.role || to.id === 'decision')) || (from.role && to.id === 'decision');
  const edges = [];
  const roles = new Map();
  const usedSources = new Map();
  const addEdge = (from, to, kind, origin) => {
    if (!from || !to || !allowed(from, to) || edges.some(edge => edge.from === from.id && edge.to === to.id)) return;
    edges.push({ from: from.id, to: to.id, kind, origin });
    [from, to].forEach(end => {
      if (end.role) roles.set(end.id, end.role);
      if (end.source) usedSources.set(end.id, end.source);
    });
  };
  (report.semanticMap?.edges || []).forEach(edge => addEdge(declaredNodes.get(edge.from), declaredNodes.get(edge.to), edge.kind, 'semantic map'));
  (report.proofs || []).forEach(proof => {
    const source = findProofSource(proof);
    const role = roleFor(proof.agent);
    addEdge(source && { id: `source_${source.id}`, source }, role ? { id: roleId(role), role } : { id: 'decision' }, ['challenged', 'blocked'].includes(proof.status) ? 'challenges' : 'supports', 'proof claim');
  });
  const distribute = (items, x, start, end) => items.map((item, index) => ({ item, x, y: items.length === 1 ? (start + end) / 2 : start + ((end - start) * index) / (items.length - 1) }));
  const sourceList = [...usedSources.entries()].slice(0, 6);
  const roleList = [...roles.entries()];
  const nodes = [
    ...distribute(sourceList, 105, 80, 400).map(({ item: [id, source], x, y }) => ({ id, label: displayTraceLabel(source.name, 'Source', 2), title: source.name, sub: /\.[a-z0-9]+$/i.test(source.id) ? source.id.split('.').pop() : source.kind || 'evidence', type: 'source', x, y, radius: 34 })),
    ...distribute(roleList, 380, 130, 350).map(({ item: [id, role], x, y }) => ({ id, label: role.name, title: role.name, sub: 'finding', type: 'agent', x, y, radius: 38 })),
    { id: 'decision', label: displayTraceLabel(report.recommendation?.title, 'Recommendation', 6), title: report.recommendation?.title, sub: 'recommendation', type: 'decision', x: 650, y: 240, radius: 52 }
  ];
  const visible = new Set(nodes.map(node => node.id));
  return { nodes, edges: edges.filter(edge => visible.has(edge.from) && visible.has(edge.to)) };
}

function renderSemanticMap(map) {
  const svg = $('#semanticMap');
  svg.replaceChildren();
  const namespace = 'http://www.w3.org/2000/svg';
  const nodeById = new Map(map.nodes.map(node => [node.id, node]));

  map.edges.forEach(edge => {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to) return;
    const line = document.createElementNS(namespace, 'path');
    const midX = (from.x + to.x) / 2;
    const curve = Math.min(34, Math.abs(to.x - from.x) * .11);
    line.setAttribute('d', `M ${from.x} ${from.y} Q ${midX} ${(from.y + to.y) / 2 - curve} ${to.x} ${to.y}`);
    line.setAttribute('class', `semantic-edge ${edge.kind}`);
    line.dataset.kind = edge.kind;
    svg.appendChild(line);
  });

  map.nodes.forEach(node => {
    const group = document.createElementNS(namespace, 'g');
    group.setAttribute('class', `semantic-node ${node.type}`);
    group.setAttribute('transform', `translate(${node.x} ${node.y})`);
    group.dataset.nodeId = node.id;

    const circle = document.createElementNS(namespace, 'circle');
    circle.setAttribute('r', String(node.radius));
    // Wrap the label inside its circle: roughly 1.6 characters per unit of radius.
    const lines = wrapNodeLabel(node.label, Math.floor(node.radius / 3.2), node.type === 'decision' ? 3 : 2);
    const label = document.createElementNS(namespace, 'text');
    const lineHeight = 9;
    const top = (node.sub ? -4 : 3) - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, index) => {
      const span = document.createElementNS(namespace, 'tspan');
      span.setAttribute('x', '0');
      span.setAttribute('y', String(top + index * lineHeight));
      span.textContent = line;
      label.append(span);
    });
    const sub = document.createElementNS(namespace, 'text');
    sub.setAttribute('class', 'node-sub');
    sub.setAttribute('y', String(top + (lines.length - 1) * lineHeight + 12));
    sub.textContent = node.sub;
    const tooltip = document.createElementNS(namespace, 'title');
    tooltip.textContent = node.title || node.label;
    group.append(tooltip, circle, label, sub);
    group.addEventListener('click', () => selectSemanticNode(node, map));
    svg.appendChild(group);
  });
  $('.view-tabs [data-view="semanticView"] span').textContent = String(map.nodes.length).padStart(2, '0');
  const decision = map.nodes.find(node => node.type === 'decision');
  if (decision) selectSemanticNode(decision, map);
}

function selectSemanticNode(node, map) {
  const adjacent = map.edges.filter(edge => edge.from === node.id || edge.to === node.id);
  const support = adjacent.filter(edge => edge.kind === 'supports').length;
  const challenges = adjacent.filter(edge => edge.kind === 'challenges').length;
  $('#topologyTitle').textContent = node.title || node.label;
  const typeLabel = node.type === 'decision' ? 'Recommendation' : node.type === 'agent' ? 'Specialist finding' : 'Source evidence';
  $('#topologyBody').textContent = `${typeLabel} with ${adjacent.length} declared paths: ${support} supporting and ${challenges} challenging. Select another node to inspect its evidence trail.`;
  const values = $('.topology-panel dl').querySelectorAll('dd');
  values[0].textContent = support;
  values[1].textContent = challenges;
  values[2].textContent = typeLabel;
  values[3].textContent = 'Source-linked';
  document.querySelectorAll('.semantic-node').forEach(element => {
    const connected = element.dataset.nodeId === node.id || adjacent.some(edge => edge.from === element.dataset.nodeId || edge.to === element.dataset.nodeId);
    element.classList.toggle('dimmed', !connected);
  });
}

function renderReport(report) {
  currentReport = report;
  const isLive = report.mode === 'live';
  const { recommendation, contradiction, experiment } = report;
  $('#recommendationTitle').textContent = recommendation.title;
  $('#recommendationSummary').textContent = recommendation.summary;
  $('#confidenceValue').textContent = `${recommendation.confidence}%`;
  $('#confidenceBar').style.width = `${recommendation.confidence}%`;
  $('#evidenceCount').textContent = `${recommendation.supportingEvidence} supporting · ${recommendation.challengingEvidence} challenging`;
  const isMissingDefinition = /not clearly defined|not defined|uncertainty/i.test(contradiction.forQuote);
  const decisionTitle = isMissingDefinition
    ? contradiction.title.replace(/^Uncertainty in\s+/i, 'Define ') + ' clearly'
    : contradiction.title;
  const decisionBody = isMissingDefinition
    ? 'The intended outcome is clear, but the rule that makes it testable is still missing. Set that rule before implementation begins.'
    : contradiction.body;
  $('#contradictionTitle').textContent = decisionTitle;
  $('#contradictionBody').textContent = decisionBody;
  $('#evidenceVersus').innerHTML = `<div class="decision-side"><span>${isMissingDefinition ? 'Missing definition' : 'Signal to balance'}</span><div class="versus-quote">${escapeHtml(contradiction.forQuote)}</div></div><div class="decision-side"><span>${isMissingDefinition ? 'Required outcome' : 'Evidence to balance'}</span><div class="versus-quote">${escapeHtml(contradiction.againstQuote)}</div></div>`;
  $('#decisionResolution').textContent = isMissingDefinition
    ? 'Before build: define the categories, the rule for assigning them, and a few examples that prove the rule works.'
    : 'Before build: decide which signal is the constraint, then turn that choice into acceptance criteria.';
  $('#experimentTitle').textContent = experiment.title;
  $('#experimentBody').textContent = experiment.body;
  $('#experimentWindow').textContent = experiment.window;
  $('#experimentMetric').textContent = experiment.metric;
  $('#reportId').textContent = report.reportId;
  renderSources(report.sources);
  renderSignals(report.signals);
  renderEngineTrace(report);
  renderParsedSheets(report);
  renderPromises(report.promises || [], report.promiseJudge);
  renderProofs(report.proofs || []);
  renderExecutionTrace(report);
  renderSemanticMap(buildDecisionTraceMap(report));
  setFactoryRoleState('complete');

  $('#runtimeMode').textContent = isLive ? 'RocketRide result' : 'Demo fixture';
}

function setProofMode(enabled) {
  proofMode = enabled;
  $('#proofPanel').classList.toggle('active', proofMode);
  $('#proofPanel').hidden = !proofMode;
  $('#proofToggle').classList.toggle('active', proofMode);
  $('#proofToggle').setAttribute('aria-pressed', String(proofMode));
}

function showToast(message, duration = 4200) {
  clearTimeout(toastTimer);
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

function activateView(viewId) {
  document.querySelectorAll('.view-tabs button').forEach(button => {
    button.classList.toggle('active', button.dataset.view === viewId);
  });
  document.querySelectorAll('.view-panel').forEach(panel => {
    const active = panel.id === viewId;
    panel.hidden = !active;
    panel.classList.toggle('active', active);
  });
}

function showReportTruth(report, origin) {
  const banner = $('#truthBanner');
  banner.hidden = false;
  banner.className = `truth-banner ${report.mode === 'live' ? 'live' : 'unverified'}`;
  $('.truth-badge').textContent = report.mode === 'live' ? 'LIVE RUN' : 'UNVERIFIED';
  if (report.mode === 'live' && origin === 'local') {
    $('.truth-banner p').innerHTML = '<strong>Live scope report.</strong> Generated by the local RocketRide runner and ready for human review.';
  } else if (report.mode === 'live') {
    $('.truth-banner p').innerHTML = '<strong>This file declares itself as a live RocketRide result.</strong> The browser validated its shape, not its provenance. Generate it with the included CLI for a traceable run.';
  } else {
    $('.truth-banner p').innerHTML = '<strong>This imported report is not marked as a live RocketRide result.</strong> Its contents are displayed as provided and have not been independently verified.';
  }
}

// Completed live runs of the same scope workflow, read from the run store.
async function prepareLiveDecisions() {
  try {
    const { decisions = [] } = await fetch('/api/decisions', { cache: 'no-store' }).then(response => response.json());
    $('#liveDecisions').hidden = !decisions.length;
    $('#liveDecisionCount').textContent = String(decisions.length);
    $('#liveDecisionGrid').innerHTML = decisions.map(decision => `
      <article class="live-decision">
        <span class="eyebrow">Live run · ${escapeHtml(new Date(decision.completedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))} · ${decision.sources.length} source${decision.sources.length === 1 ? '' : 's'}</span>
        <q>${escapeHtml(decision.brief)}</q>
        <div class="live-decision-part"><span>Recommended bet</span><strong>${escapeHtml(decision.recommendation.title || '')}</strong></div>
        <div class="live-decision-part"><span>Contradiction</span><p>${escapeHtml(decision.contradiction.title || '')}</p></div>
        <div class="live-decision-part"><span>Next experiment</span><p>${escapeHtml(decision.experiment.title || '')}${decision.experiment.window ? ` · ${escapeHtml(decision.experiment.window)}` : ''}</p></div>
        <button class="button button-ghost" type="button" data-open-decision="${escapeHtml(decision.id)}">Open decision</button>
      </article>
    `).join('');
    document.querySelectorAll('[data-open-decision]').forEach(button => button.addEventListener('click', () => openLiveDecision(button.dataset.openDecision)));
  } catch {
    $('#liveDecisions').hidden = true;
  }
}

async function openLiveDecision(runId) {
  try {
    const { run } = await fetch(`/api/runs/${encodeURIComponent(runId)}`, { cache: 'no-store' }).then(response => response.json());
    const report = normalizeReport(run.report);
    report.mode = 'live';
    report.provenance = run.report.provenance;
    renderReport(report);
    showReportTruth(report, 'local');
    scrollToReview();
    await restoreMissionFromRun(report);
    showToast('Opened a completed live RocketRide run. The browser did not call the model again.');
  } catch {
    showToast('That run could not be opened from the run store.');
  }
}

async function prepareLocalLiveReport() {
  try {
    const response = await fetch(`./data/live-report.json?cache=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return;
    const raw = await response.json();
    const report = normalizeReport(raw);
    report.mode = raw.mode === 'live' ? 'live' : 'imported';
    report.provenance = raw.provenance;
    localLiveReport = report;
    $('#loadLiveButton').hidden = false;
    $('#openLatestLiveButton').hidden = false;
  } catch {
    // The published demo intentionally has no local run file. Manual import remains available.
  }
}

async function prepareRocketRideHealth() {
  const status = $('#engineStatus');
  try {
    const response = await fetch(`./data/rocketride-health.json?cache=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return;
    const health = await response.json();
    const checked = new Date(health.checkedAt);
    const ageMs = Date.now() - checked.getTime();
    const fresh = Number.isFinite(ageMs) && ageMs < 5 * 60 * 1000;
    status.className = `engine-status ${health.ok ? fresh ? 'healthy' : 'stale' : 'failed'}`;
    status.querySelector('strong').textContent = health.ok
      ? fresh ? 'RocketRide engine and pipeline verified' : 'RocketRide passed its last check'
      : 'RocketRide health check failed';
    status.querySelector('span').textContent = health.ok
      ? `Authenticated ping ${health.latencyMs} ms · ${health.pipeline} · ${health.validation.errors} validation errors`
      : health.message;
    status.querySelector('code').textContent = health.ok
      ? `${fresh ? 'checked' : 'last checked'} ${checked.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : 'attention needed';
  } catch {
    // Absence means "not checked," never "healthy."
  }
}

function loadLocalLiveReport() {
  if (!localLiveReport) {
    showToast('No verified local run is available yet. Run npm run analyze:live or import a report file.');
    return;
  }
  renderReport(localLiveReport);
  showReportTruth(localLiveReport, 'local');
  scrollToReview();
  showToast('Loaded the latest successful local RocketRide run. The browser did not call the model again.');
  void restoreMissionFromRun(localLiveReport);
}

// A live report can feed a build mission only when the server still holds the
// completed run record that produced it; imported files stay review-only.
async function restoreMissionFromRun(report) {
  const runId = report?.provenance?.runId;
  if (report?.mode !== 'live' || !runId) return;
  try {
    const response = await fetch(`/api/runs/${encodeURIComponent(runId)}`, { cache: 'no-store' });
    if (!response.ok) return;
    const { run } = await response.json();
    if (run?.kind !== 'scope' || run.status !== 'complete' || run.report?.reportId !== report.reportId || !run.brief) return;
    currentRunId = runId;
    currentMission = { title: missionTitleFromRequest(run.brief), brief: run.brief, runId };
    scopeReportReady = true;
  } catch { /* Without the run record the report stays review-only. */ }
}

const tourSteps = [
  {
    eyebrow: 'The essence',
    title: 'A software factory from request to microapp.',
    body: 'Signal turns a product request and optional context into a scoped build mission, then can build a working microapp, test it, and open the implementation for review on an explicitly trusted repository.',
    target: '.start-screen',
    view: 'decisionView'
  },
  {
    eyebrow: 'Step 01 · Inputs',
    title: 'Begin with the requested change.',
    body: 'Describe the user, expected behavior, and constraints. Add context only when it changes the scope.',
    target: '#factoryIdeaInput',
    view: 'decisionView'
  },
  {
    eyebrow: 'Step 02 · RocketRide',
    title: 'RocketRide runs the scope workflow.',
    body: 'Customer Advocate, Skeptic, and Product Strategist are configured specialist roles. RocketRide runs their workflow, synthesis, validation, and trace capture.',
    target: '.factory-operators',
    view: 'decisionView'
  },
  {
    eyebrow: 'Step 03 · Decision',
    title: 'Approve a bounded scope before code starts.',
    body: 'The scope workflow returns a decision and evidence. A person decides whether to create the implementation mission.',
    target: '.pipeline-strip',
    view: 'decisionView'
  },
  {
    eyebrow: 'Step 04 · Promise Theory',
    title: 'Trust is modeled as kept promises.',
    body: 'Each specialist role has a narrow commitment—for example, cite evidence or expose rival explanations. The ledger marks that commitment kept, qualified, or broken.',
    target: '#promiseView .theory-header',
    view: 'promiseView'
  },
  {
    eyebrow: 'Step 05 · Semantic Spacetime',
    title: 'Relevance comes from relationships.',
    body: 'The map places sources, specialist findings, and the decision in a declared support/challenge topology. It helps inspect adjacency; it does not claim that visual proximity proves causality.',
    target: '.semantic-canvas',
    view: 'semanticView'
  },
  {
    eyebrow: 'Step 06 · Live workflow',
    title: 'Run RocketRide when the engine is connected.',
    body: 'The engine row reports the real local connection status. A failed run never becomes a fake result; replaying a saved report never calls a model.',
      target: '#engineStatus',
    view: 'decisionView'
  },
  {
    eyebrow: 'Step 07 · Delivery review',
    title: 'RocketRide returns at the verification handoff.',
    body: 'After the coding runner changes files and records its quality gates, a separate RocketRide workflow assesses the mission, summary, diff stat, and results. It informs human PR review; it never ships automatically.',
    target: '.execution-panel',
    view: 'decisionView'
  }
];

function renderTourStep() {
  const step = tourSteps[tourIndex];
  activateView(step.view);
  document.querySelectorAll('.tour-focus').forEach(element => element.classList.remove('tour-focus'));
  const target = document.querySelector(step.target);
  if (target) {
    target.classList.add('tour-focus');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  $('#tourStep').textContent = `${String(tourIndex + 1).padStart(2, '0')} / ${String(tourSteps.length).padStart(2, '0')}`;
  $('#tourEyebrow').textContent = step.eyebrow;
  $('#tourTitle').textContent = step.title;
  $('#tourBody').textContent = step.body;
  $('#tourBack').disabled = tourIndex === 0;
  $('#tourNext').textContent = tourIndex === tourSteps.length - 1 ? 'Finish' : 'Next';
}

function startTour() {
  $('#reviewWorkspace').hidden = false;
  tourIndex = 0;
  $('#tourCard').hidden = false;
  document.body.classList.add('tour-active');
  renderTourStep();
}

function closeTour() {
  $('#tourCard').hidden = true;
  document.body.classList.remove('tour-active');
  document.querySelectorAll('.tour-focus').forEach(element => element.classList.remove('tour-focus'));
}

function advanceTour(direction) {
  if (direction > 0 && tourIndex === tourSteps.length - 1) return closeTour();
  tourIndex = Math.max(0, Math.min(tourSteps.length - 1, tourIndex + direction));
  renderTourStep();
}

async function replayAnalysis() {
  renderPipeline(currentReport.mode === 'live' ? rocketRidePipeline : currentReport.pipeline, 'running');

  const nodes = [...document.querySelectorAll('.pipeline-node')];
  for (const node of nodes) {
    nodes.forEach(item => item.classList.remove('processing'));
    node.classList.add('processing');
    await new Promise(resolve => setTimeout(resolve, 330));
    node.classList.remove('processing');
    node.classList.add('done');
  }

  document.querySelectorAll('.reveal-card').forEach((card, index) => {
    card.style.animation = 'none';
    requestAnimationFrame(() => {
      card.style.animation = `rise .45s ${index * 55}ms both`;
    });
  });
  showToast(currentReport.mode === 'live'
    ? 'Replayed the imported RocketRide result. No model call was made by this browser.'
    : 'Demo replay complete. These findings came from the bundled fixture—not a live model call.');
}

async function buildRocketRideInput() {
  const brief = $('#factoryIdeaInput').value.trim();
  const fallback = await fetch('./data/sample-evidence.txt', { cache: 'no-store' })
    .then(response => response.ok ? response.text() : '');
  const context = stagedEvidenceText || fallback;
  return { brief, evidence: stagedEvidenceFiles.length ? '' : context, files: stagedEvidenceFiles };
}

async function analyzeSelectedScenario() {
  renderReport(selectedScenario.report);
  stagedEvidenceText = selectedScenario.evidenceText;
  setProofMode(true);
  scrollToReview();
  await replayAnalysis();
}

let liveFlowPoll;
const liveFlowOrder = ['Parse evidence', 'Customer advocate', 'Skeptic', 'Product strategist', 'Promise judge', 'Decision synthesis', 'Enforce report contract'];

// The server relays the first flow event of each step; the step that started
// last is the one the engine is working on, and earlier steps have finished.
function renderLiveFlow(progress) {
  const started = new Set((progress.steps || []).map(item => item.step));
  const current = liveFlowOrder.filter(step => started.has(step)).at(-1);
  const finished = progress.status === 'complete';
  document.querySelectorAll('[data-flow-step]').forEach(node => {
    const step = node.dataset.flowStep;
    node.classList.toggle('done', finished || (started.has(step) && step !== current));
    node.classList.toggle('active', !finished && step === current);
  });
  $('#liveFlow').classList.toggle('failed', progress.status === 'failed');
  $('#liveFlowState').textContent = finished
    ? 'Scope report ready for human review'
    : progress.status === 'failed'
      ? `Stopped${current ? ` during ${current.toLowerCase()}` : ''}`
      : current ? `RocketRide is running: ${current.toLowerCase()}` : 'Waiting for the engine';
}

function startLiveFlow() {
  const formats = [...new Set(stagedEvidenceFiles.map(file => String(file.name).split('.').pop().toUpperCase()))];
  $('#liveFlowFormats').textContent = formats.length ? `+ ${formats.join(' · ')}` : 'text';
  renderLiveFlow({ status: 'running', steps: [] });
  $('#liveFlow').hidden = false;
  clearInterval(liveFlowPoll);
  liveFlowPoll = setInterval(async () => {
    try {
      const progress = await fetch('/api/scope-progress', { cache: 'no-store' }).then(response => response.json());
      if (progress.status === 'running') renderLiveFlow(progress);
    } catch { /* The final state is set when the run returns. */ }
  }, 700);
}

async function stopLiveFlow(status) {
  clearInterval(liveFlowPoll);
  try {
    const progress = await fetch('/api/scope-progress', { cache: 'no-store' }).then(response => response.json());
    renderLiveFlow({ ...progress, status });
  } catch {
    renderLiveFlow({ status, steps: [] });
  }
}

async function runLiveAnalysis(event) {
  const brief = $('#factoryIdeaInput').value.trim();
  if (!brief) {
    focusFactoryInput();
    $('#requestValidation').classList.add('invalid');
    showToast('Describe the microapp before running the scope workflow.');
    return;
  }
  $('#requestValidation').classList.remove('invalid');
  const button = event?.currentTarget || $('#liveAnalyzeButton');
  const previous = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<span>◈</span> Running RocketRide';
  setScopeRunNotice('RocketRide is reading the request and context. The scope report will open when it is ready.', 'running');
  $('#engineStatus').className = 'engine-status stale';
  $('#engineStatus strong').textContent = 'RocketRide live run in progress';
  $('#engineStatus span').textContent = 'The browser is calling the local dev server, which calls the RocketRide runner.';
  $('#engineStatus code').textContent = 'running';
  setFactoryRoleState('running');
  renderPipeline(rocketRidePipeline, 'running');
  startLiveFlow();

  try {
    const input = await buildRocketRideInput();
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input)
    });
    const payload = await response.json();
    if (response.status === 409 && payload.code === 'scope-workflow-running') {
      throw new Error(payload.message);
    }
    if (!response.ok || !payload.ok) {
      throw new Error(payload.stderr || payload.message || 'RocketRide run failed.');
    }
    const report = normalizeReport(payload.report);
    report.mode = payload.report.mode === 'live' ? 'live' : 'imported';
    report.provenance = payload.report.provenance;
    currentRunId = payload.runId;
    renderReport(report);
    currentMission = {
      title: missionTitleFromRequest(brief),
      brief,
      runId: payload.runId
    };
    scopeReportReady = report.mode === 'live';
    $('#loadLiveButton').hidden = true;
    showReportTruth(report, 'local');
    scrollToReview();
    $('#engineStatus').className = 'engine-status healthy';
    $('#engineStatus strong').textContent = 'RocketRide produced a live decision report';
    $('#engineStatus span').textContent = 'The report was generated by the local runner and loaded into Proof Mode.';
    $('#engineStatus code').textContent = 'live run';
    setFactoryRoleState('complete');
    setProofMode(true);
    setScopeRunNotice('Scope report ready. Opening the decision for review.', 'complete');
    await stopLiveFlow('complete');
    void prepareLiveDecisions();
    showToast('RocketRide live run complete. Proof Mode is showing the claims tied to evidence.');
  } catch (error) {
    const technicalMessage = error instanceof Error ? error.message : 'The RocketRide scope run failed.';
    const message = /Failed to connect to ws:\/\/localhost:5565/i.test(technicalMessage)
      ? 'RocketRide is offline on this Mac. Start the local engine, then run the workflow again.'
      : error instanceof TypeError && /fetch|network|load failed/i.test(technicalMessage)
        ? 'Lost the connection to the local Signal server. Restart it with npm run dev, then run the workflow again.'
        : technicalMessage;
    renderPipeline(currentReport.mode === 'live' ? rocketRidePipeline : currentReport.pipeline, 'done');
    $('#engineStatus').className = 'engine-status failed';
    $('#engineStatus strong').textContent = 'RocketRide live run failed';
    $('#engineStatus span').textContent = message;
    $('#engineStatus code').textContent = 'failed';
    setFactoryRoleState('failed');
    setScopeRunNotice(`The scope run stopped: ${message}`, 'failed');
    await stopLiveFlow('failed');
    showToast(message, 8000);
  } finally {
    button.disabled = false;
    button.innerHTML = previous;
  }
}

async function importReport(file) {
  try {
    const raw = JSON.parse(await file.text());
    const verified = verifyReportProofs(raw);
    const report = normalizeReport(verified);
    report.mode = raw.mode === 'live' ? 'live' : 'imported';
    report.provenance = raw.provenance;
    renderReport(report);
    showReportTruth(report, 'file');
    scrollToReview();
    showToast(`Imported ${file.name}. Report shape is valid; provenance depends on how the file was produced.`);
  } catch (error) {
    showToast(`Could not import report: ${error.message}`, 6500);
  }
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function addUnanalyzedFiles(files) {
  if (!files.length) return;
  const selected = [...files];
  const selectedStates = selected.map(file => ({
    name: file.name,
    detail: 'Reading file…',
    status: 'reading'
  }));
  attachedFiles = [...attachedFiles, ...selectedStates];
  renderAttachmentList();

  let added;
  try {
    added = await Promise.all(selected.map(async (file, index) => {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const isSpreadsheet = ext === 'xlsx';
      const buffer = await file.arrayBuffer();
      stagedEvidenceFiles.push({
        name: file.name,
        mimeType: file.type || (isSpreadsheet ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/plain'),
        dataBase64: arrayBufferToBase64(buffer)
      });
      return {
        id: `local_${Date.now()}_${index}`,
        kind: isSpreadsheet ? 'SHEET' : ext.slice(0, 4).toUpperCase() || 'FILE',
        name: file.name,
        meta: `${Math.max(1, Math.round(file.size / 1024))} KB · not analyzed`,
        content: isSpreadsheet ? 'Binary spreadsheet staged for server-side parsing.' : new TextDecoder().decode(buffer).slice(0, 100000),
        contentStatus: 'staged',
        status: 'pending'
      };
    }));
  } catch (error) {
    selectedStates.forEach(file => {
      file.detail = 'Could not read this file';
      file.status = 'failed';
    });
    renderAttachmentList();
    showToast(error instanceof Error ? error.message : 'Signal could not read the selected file.', 7000);
    return;
  }

  selectedStates.forEach(file => {
    file.detail = 'Ready for scope workflow';
    file.status = 'ready';
  });
  renderAttachmentList();
  const allStagedSources = [...displayedSources.filter(source => source.contentStatus === 'staged'), ...added];
  stagedEvidenceText = allStagedSources.map(source => `SOURCE: ${source.name}\n${source.content}`).join('\n\n');
  renderSources([...displayedSources, ...added]);
  if (!$('.factory-output').hidden) renderPreparedInputs();
  $('#scenarioOutcomeTitle').textContent = 'Custom evidence staged';
  $('#scenarioOutcomeBody').textContent = 'Run RocketRide to generate a real outcome from these files. The UI will not invent an answer from uploaded evidence.';
  $('#scenarioDecisionType').textContent = 'Custom live run';
  $('#scenarioRisk').textContent = 'No recommendation until the engine analyzes it.';
  $('#scenarioEvidenceMix').textContent = `${added.length} local file${added.length === 1 ? '' : 's'}`;
  showToast(`${added.length} file${added.length === 1 ? '' : 's'} staged. Click Run scope workflow to analyze them with the local RocketRide engine.`, 7000);
}

renderScenarios();
selectScenario(selectedScenario.id);
renderSources([]);
renderFactoryEmpty();
syncScopeAction();
setProofMode(true);
prepareLocalLiveReport();
prepareLiveDecisions();
prepareRocketRideHealth();

$('#factoryGenerateButton').addEventListener('click', runLiveAnalysis);
$('#factoryIdeaInput').addEventListener('input', syncScopeAction);
$('#scopeWithRocketRide').addEventListener('click', runLiveAnalysis);
$('#createMissionReviewButton').addEventListener('click', createBuildMission);
$('#dispatchExecutionButton').addEventListener('click', dispatchExecution);
$('#factoryClearButton').addEventListener('click', () => {
  $('#factoryIdeaInput').value = '';
  renderFactoryEmpty();
  syncScopeAction();
  showToast('Your idea and generated plan were cleared.');
});
$('#liveAnalyzeButton').addEventListener('click', runLiveAnalysis);
$('#proofToggle').addEventListener('click', () => setProofMode(!proofMode));
$('#loadLiveButton').addEventListener('click', loadLocalLiveReport);
$('#openLatestLiveButton').addEventListener('click', loadLocalLiveReport);
$('#importButton').addEventListener('click', () => $('#reportInput').click());
$('#reportInput').addEventListener('change', event => event.target.files[0] && importReport(event.target.files[0]));
let lastHandledFileSelection = '';
async function handleFileSelection(event) {
  const selectionKey = [...event.target.files].map(file => `${file.name}:${file.size}:${file.lastModified}`).join('|');
  if (!selectionKey || selectionKey === lastHandledFileSelection) return;
  lastHandledFileSelection = selectionKey;
  await addUnanalyzedFiles(event.target.files);
  event.target.value = '';
  lastHandledFileSelection = '';
}
$('#fileInput').addEventListener('input', handleFileSelection);
$('#fileInput').addEventListener('change', handleFileSelection);
$('#dismissTruth').addEventListener('click', () => { $('#truthBanner').hidden = true; });
$('[data-open-trace]').addEventListener('click', () => $('#traceDialog').showModal());
$('#closeTrace').addEventListener('click', () => $('#traceDialog').close());
$('#traceDialog').addEventListener('click', event => {
  if (event.target === $('#traceDialog')) $('#traceDialog').close();
});
$('#closeSource').addEventListener('click', () => $('#sourceDialog').close());
$('#sourceDialog').addEventListener('click', event => {
  if (event.target === $('#sourceDialog')) $('#sourceDialog').close();
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('#tourCard').hidden) closeTour();
  if (event.key === 'r' && !event.metaKey && !event.ctrlKey && document.activeElement === document.body) replayAnalysis();
});

$('#tourButton').addEventListener('click', startTour);
$('#connectionsButton').addEventListener('click', () => {
  $('#connectionsDialog').showModal();
  refreshConnections();
});
$('#closeConnections').addEventListener('click', () => $('#connectionsDialog').close());
$('#connectionsDialog').addEventListener('click', event => {
  if (event.target === $('#connectionsDialog')) $('#connectionsDialog').close();
});
$('#refreshConnections').addEventListener('click', refreshConnections);
$('#closeTour').addEventListener('click', closeTour);
$('#tourBack').addEventListener('click', () => advanceTour(-1));
$('#tourNext').addEventListener('click', () => advanceTour(1));

document.querySelectorAll('.view-tabs button').forEach(button => {
  button.addEventListener('click', () => {
    activateView(button.dataset.view);
  });
});

document.querySelectorAll('.map-filter').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.map-filter').forEach(item => item.classList.toggle('active', item === button));
    document.querySelectorAll('.semantic-edge').forEach(edge => {
      edge.classList.toggle('dimmed', button.dataset.edge !== 'all' && edge.dataset.kind !== button.dataset.edge);
    });
    document.querySelectorAll('.semantic-node').forEach(node => node.classList.remove('dimmed'));
  });
});

$('#replayPromises').addEventListener('click', () => {
  const rows = [...document.querySelectorAll('.promise-row')];
  rows.forEach(row => row.classList.remove('assessed'));
  rows.forEach((row, index) => setTimeout(() => row.classList.add('assessed'), 180 * index));
  showToast('Replayed declared promise assessments. In live mode, these should be backed by RocketRide traces.');
});

if (new URLSearchParams(window.location.search).get('tour') === '1') {
  window.setTimeout(startTour, 450);
}
