import { normalizeReport } from './report.js';
import { scenarioLibrary, getScenario } from './scenarios.js';

const $ = selector => document.querySelector(selector);
let selectedScenario = scenarioLibrary[0];
let currentReport = selectedScenario.report;
let toastTimer;
let localLiveReport;
let tourIndex = 0;
let displayedSources = [];
let stagedEvidenceText = '';
let attachedFiles = [];
let proofMode = true;
let currentMission;
let executionPoll;
let scopeReportReady = false;
const rocketRidePipeline = [
  { label: 'Read sources', detail: 'processing', type: 'step' },
  { label: 'Customer Advocate', detail: 'specialist role', type: 'role' },
  { label: 'Skeptic', detail: 'specialist role', type: 'role' },
  { label: 'Product Strategist', detail: 'specialist role', type: 'role' },
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
  return firstLine ? firstLine.slice(0, 72) : 'Microapp request';
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
  prepareExecutionStatus();
  showToast('Build mission prepared. Connect a repository to hand this bounded task to a coding agent.', 6200);
}

function setExecutionState(execution) {
  const status = execution?.status || 'disabled';
  const phaseCopy = {
    queued: 'Queued',
    preflight: 'Checking repository',
    implementing: 'Coding runner is working',
    testing: 'Running quality gates',
    'delivery-review': 'RocketRide is assessing the tested delivery',
    'delivery-review-failed': 'RocketRide delivery review was unavailable',
    'review-ready': 'Committing tested change',
    'opening-pr': 'Opening pull request',
    complete: 'Pull request ready',
    failed: 'Execution failed',
    disabled: 'Execution disabled'
  };
  $('#executionState').textContent = execution?.detail || phaseCopy[status] || status;
  $('#executionPr').textContent = execution?.prUrl ? 'Ready for review' : status === 'opening-pr' ? 'Creating' : 'Not created';
  $('#executionTests').textContent = ['delivery-review', 'delivery-review-failed', 'review-ready', 'opening-pr', 'complete'].includes(status) ? 'Passed' : 'Tests + build';
  document.querySelectorAll('.mission-stages li').forEach((stage, index) => {
    stage.classList.toggle('prepared', index === 0 || (index === 1 && !['disabled', 'queued', 'preflight'].includes(status)) || (index === 2 && ['delivery-review', 'delivery-review-failed', 'review-ready', 'opening-pr', 'complete'].includes(status)) || (index === 3 && status === 'complete'));
  });
  const phaseOrder = ['preflight', 'implementing', 'testing', 'delivery-review', 'opening-pr'];
  const activePhase = status === 'review-ready' ? 'opening-pr' : status;
  const activeIndex = phaseOrder.indexOf(activePhase);
  document.querySelectorAll('[data-execution-phase]').forEach((item, index) => {
    item.classList.toggle('complete', activeIndex > index || status === 'complete');
    item.classList.toggle('active', activeIndex === index && status !== 'complete');
  });
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
    $('#executionRepo').textContent = config.repo || 'Not connected';
    $('#executionRunner').textContent = config.enabled ? 'Coding agent (Codex CLI)' : 'Not enabled';
    $('#executionDeliveryReview').textContent = config.deliveryReviewEnabled
      ? config.deliveryReviewRequired ? 'Required before PR' : 'Enabled before PR'
      : 'Not enabled';
    $('#executionDescription').textContent = config.message;
    $('#dispatchExecutionButton').disabled = !config.enabled || !currentMission || !scopeReportReady;
    setExecutionState();
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
      body: JSON.stringify({ title: currentMission.title, brief: currentMission.brief })
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
      : 'Connection can be prepared now. Signal build dispatch currently uses Codex.';
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
    contextHint.textContent = `${stagedFiles.length} context file${stagedFiles.length === 1 ? '' : 's'} included.`;
  } else {
    contextHint.textContent = 'Only add files that change the scope.';
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
  renderScenarioOutcome(selectedScenario);
  renderReport(selectedScenario.report);
  setProofMode(true);
  renderScenarios();
  $('#truthBanner').hidden = false;
  $('.truth-badge').textContent = 'SEED';
  $('.truth-banner p').innerHTML = '<strong>This is a deterministic seed scenario.</strong> Use it to demo expected outcomes, or run the same evidence through RocketRide from the CLI.';
  if (options.announce) {
    showToast(`Loaded ${selectedScenario.title}. The evidence is staged for Run RocketRide.`, 5200);
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

function renderPromises(promises) {
  $('#promiseLedger').innerHTML = promises.map(promise => `
    <article class="promise-row assessed">
      <div class="promise-agent"><i>${escapeHtml(promise.initials)}</i><div><strong>${escapeHtml(promise.agent)}</strong><span>promiser</span></div></div>
      <span class="promise-arrow">→</span>
      <div class="promise-body"><strong>${escapeHtml(promise.body)}</strong><small>to ${escapeHtml(promise.to)} · ${escapeHtml(promise.evidence)}</small></div>
      <span class="assessment ${escapeHtml(promise.assessment)}">${escapeHtml(promise.assessment)}</span>
    </article>
  `).join('') || '<div class="promise-row"><div class="promise-body"><strong>No promise ledger was included in this report.</strong></div></div>';
  const kept = promises.filter(promise => promise.assessment === 'kept').length;
  $('#promiseKept').textContent = kept;
  $('.promise-score span').textContent = `/ ${promises.length} kept`;
  $('.view-tabs [data-view="promiseView"] span').textContent = String(promises.length).padStart(2, '0');
}

function findProofSource(proof) {
  return currentReport.sources.find(source => source.id === proof.sourceId)
    || currentReport.sources.find(source => source.name === proof.sourceName)
    || currentReport.sources.find(source => source.name.toLowerCase().includes(String(proof.sourceName || '').toLowerCase()));
}

function renderProofs(proofs = []) {
  $('#proofCount').textContent = `${String(proofs.length).padStart(2, '0')} claims`;
  $('#proofList').innerHTML = proofs.length
    ? proofs.map((proof, index) => `
      <button class="proof-item ${escapeHtml(proof.status)}" type="button" data-proof-index="${index}">
        <span>${escapeHtml(proof.status)}</span>
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

function displayTraceLabel(value, fallback, maxWords = 3) {
  const words = String(value || fallback).replace(/[^a-zA-Z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, maxWords).join(' ') || fallback;
}

function buildDecisionTraceMap(report) {
  const proofSources = [];
  (report.proofs || []).forEach(proof => {
    const source = findProofSource(proof);
    if (source && !proofSources.some(item => item.id === source.id)) proofSources.push(source);
  });
  const sources = (proofSources.length ? proofSources : report.sources || []).slice(0, 5);
  const specialistNames = [];
  (report.proofs || []).forEach(proof => {
    const name = proof.agent || 'Specialist';
    if (!specialistNames.some(item => item.toLowerCase() === name.toLowerCase())) specialistNames.push(name);
  });
  (report.lenses || []).forEach(lens => {
    if (!specialistNames.some(item => item.toLowerCase() === lens.name.toLowerCase())) specialistNames.push(lens.name);
  });
  const agents = specialistNames.slice(0, 3);
  const distribute = (items, x, start, end) => items.map((item, index) => ({ item, x, y: items.length === 1 ? (start + end) / 2 : start + ((end - start) * index) / (items.length - 1) }));
  const nodes = [
    ...distribute(sources, 105, 80, 400).map(({ item, x, y }) => ({ id: `source_${item.id}`, label: displayTraceLabel(item.name, 'Source', 2), sub: item.kind || 'evidence', type: 'source', x, y, radius: 34 })),
    ...distribute(agents, 380, 130, 350).map(({ item, x, y }) => ({ id: `agent_${item.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, label: displayTraceLabel(item, 'Specialist'), sub: 'finding', type: 'agent', x, y, radius: 38 })),
    { id: 'decision', label: displayTraceLabel(report.recommendation?.title, 'Recommendation'), sub: 'recommendation', type: 'decision', x: 650, y: 240, radius: 52 }
  ];
  const agentId = name => `agent_${String(name || 'Specialist').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
  const visibleSourceIds = new Set(sources.map(source => source.id));
  const edges = (report.proofs || []).flatMap(proof => {
    const source = findProofSource(proof);
    if (!source || !visibleSourceIds.has(source.id)) return [];
    return [{ from: `source_${source.id}`, to: agentId(proof.agent), kind: proof.status === 'challenged' ? 'challenges' : 'supports' }];
  });
  agents.forEach(name => {
    edges.push({ from: agentId(name), to: 'decision', kind: /skeptic|challenge/i.test(name) ? 'challenges' : 'supports' });
  });
  return { nodes, edges };
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
    const label = document.createElementNS(namespace, 'text');
    label.setAttribute('y', node.sub ? '-2' : '3');
    label.textContent = node.label;
    const sub = document.createElementNS(namespace, 'text');
    sub.setAttribute('class', 'node-sub');
    sub.setAttribute('y', '13');
    sub.textContent = node.sub;
    group.append(circle, label, sub);
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
  $('#topologyTitle').textContent = node.label;
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
  $('#contradictionTitle').textContent = contradiction.title;
  $('#contradictionBody').textContent = contradiction.body;
  $('#evidenceVersus').innerHTML = `<div class="versus-quote">${escapeHtml(contradiction.forQuote)}</div><span class="versus-mark">VERSUS</span><div class="versus-quote">${escapeHtml(contradiction.againstQuote)}</div>`;
  $('#experimentTitle').textContent = experiment.title;
  $('#experimentBody').textContent = experiment.body;
  $('#experimentWindow').textContent = experiment.window;
  $('#experimentMetric').textContent = experiment.metric;
  $('#reportId').textContent = report.reportId;
  renderSources(report.sources);
  renderSignals(report.signals);
  renderPipeline(isLive ? rocketRidePipeline : report.pipeline, 'done');
  renderPromises(report.promises || []);
  renderProofs(report.proofs || []);
  renderSemanticMap(buildDecisionTraceMap(report));
  setFactoryRoleState('complete');

  $('#runtimeMode').textContent = isLive ? 'RocketRide result' : 'Demo fixture';
  $('#runtimeLabel').textContent = isLive ? 'live result' : 'demo result';
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
  $('#truthBanner').hidden = false;
  $('.truth-badge').textContent = report.mode === 'live' ? 'LIVE RUN' : 'UNVERIFIED';
  if (report.mode === 'live' && origin === 'local') {
    $('.truth-banner p').innerHTML = '<strong>This is the latest report produced by the local RocketRide runner.</strong> The browser loaded its saved result and provenance; it did not make another model call.';
  } else if (report.mode === 'live') {
    $('.truth-banner p').innerHTML = '<strong>This file declares itself as a live RocketRide result.</strong> The browser validated its shape, not its provenance. Generate it with the included CLI for a traceable run.';
  } else {
    $('.truth-banner p').innerHTML = '<strong>This imported report is not marked as a live RocketRide result.</strong> Its contents are displayed as provided and have not been independently verified.';
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
  if (!brief) return context;
  return `MISSION BRIEF (user instruction)\n${brief}\n\nOPTIONAL CONTEXT FILES\n${context}`;
}

async function analyzeSelectedScenario() {
  renderReport(selectedScenario.report);
  stagedEvidenceText = selectedScenario.evidenceText;
  setProofMode(true);
  scrollToReview();
  await replayAnalysis();
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

  try {
    const evidence = await buildRocketRideInput();
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ evidence })
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.stderr || payload.message || 'RocketRide run failed.');
    }
    const report = normalizeReport(payload.report);
    report.mode = payload.report.mode === 'live' ? 'live' : 'imported';
    report.provenance = payload.report.provenance;
    renderReport(report);
    currentMission = {
      title: missionTitleFromRequest(brief),
      brief
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
    showToast('RocketRide live run complete. Proof Mode is showing the claims tied to evidence.');
  } catch (error) {
    const technicalMessage = error instanceof Error ? error.message : 'The RocketRide scope run failed.';
    const message = /Failed to connect to ws:\/\/localhost:5565/i.test(technicalMessage)
      ? 'RocketRide is offline on this Mac. Start the local engine, then run the workflow again.'
      : technicalMessage;
    renderPipeline(currentReport.mode === 'live' ? rocketRidePipeline : currentReport.pipeline, 'done');
    $('#engineStatus').className = 'engine-status failed';
    $('#engineStatus strong').textContent = 'RocketRide live run failed';
    $('#engineStatus span').textContent = message;
    $('#engineStatus code').textContent = 'failed';
    setFactoryRoleState('failed');
    setScopeRunNotice(`RocketRide could not complete this scope run: ${message}`, 'failed');
    showToast(message, 8000);
  } finally {
    button.disabled = false;
    button.innerHTML = previous;
  }
}

async function importReport(file) {
  try {
    const raw = JSON.parse(await file.text());
    const report = normalizeReport(raw);
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
    added = await Promise.all(selected.map(async (file, index) => ({
      id: `local_${Date.now()}_${index}`,
      kind: file.name.split('.').pop()?.slice(0, 4).toUpperCase() || 'FILE',
      name: file.name,
      meta: `${Math.max(1, Math.round(file.size / 1024))} KB · not analyzed`,
      content: (await file.text()).slice(0, 100000),
      contentStatus: 'staged',
      status: 'pending'
    })));
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
  showToast(`${added.length} file${added.length === 1 ? '' : 's'} staged. Click Run RocketRide to analyze them with the local engine.` , 7000);
}

renderScenarios();
selectScenario(selectedScenario.id);
renderSources([]);
renderFactoryEmpty();
syncScopeAction();
setProofMode(true);
prepareLocalLiveReport();
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
