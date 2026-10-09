const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function validateReport(candidate) {
  const errors = [];
  if (!isObject(candidate)) return { ok: false, errors: ['Report must be a JSON object.'] };
  if (!isObject(candidate.recommendation)) errors.push('Missing recommendation object.');
  if (!Array.isArray(candidate.sources)) errors.push('Missing sources array.');
  if (!Array.isArray(candidate.signals)) errors.push('Missing signals array.');
  if (!isObject(candidate.contradiction)) errors.push('Missing contradiction object.');
  if (!isObject(candidate.experiment)) errors.push('Missing experiment object.');

  if (isObject(candidate.recommendation)) {
    if (typeof candidate.recommendation.title !== 'string') errors.push('Recommendation title must be text.');
    const confidence = Number(candidate.recommendation.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) {
      errors.push('Recommendation confidence must be between 0 and 100.');
    }
  }
  if (Array.isArray(candidate.proofs)) {
    const sourceIds = new Set(Array.isArray(candidate.sources) ? candidate.sources.map(source => source?.id).filter(Boolean) : []);
    const sourceNames = new Set(Array.isArray(candidate.sources) ? candidate.sources.map(source => source?.name).filter(Boolean) : []);
    candidate.proofs.forEach((proof, index) => {
      if (!proof?.claim || typeof proof.claim !== 'string') errors.push(`Proof ${index + 1} must include a claim.`);
      if (!proof?.sourceId && !proof?.sourceName) errors.push(`Proof ${index + 1} must include a source reference.`);
      if (proof?.sourceId && sourceIds.size && !sourceIds.has(proof.sourceId)) errors.push(`Proof ${index + 1} references an unknown source id.`);
      if (proof?.sourceName && sourceNames.size && !sourceNames.has(proof.sourceName)) errors.push(`Proof ${index + 1} references an unknown source name.`);
    });
  }
  return { ok: errors.length === 0, errors };
}

export function normalizeReport(candidate) {
  const validation = validateReport(candidate);
  if (!validation.ok) throw new Error(validation.errors.join(' '));

  const cleanText = (value, fallback = '') => typeof value === 'string' ? value.trim() : fallback;
  const cleanCount = value => Math.max(0, Math.round(Number(value) || 0));
  const confidence = Math.max(0, Math.min(100, Math.round(Number(candidate.recommendation.confidence))));

  return {
    schemaVersion: 1,
    mode: candidate.mode === 'live' ? 'live' : 'imported',
    reportId: cleanText(candidate.reportId, `import_${Date.now()}`),
    generatedAt: cleanText(candidate.generatedAt, new Date().toISOString()),
    recommendation: {
      title: cleanText(candidate.recommendation.title, 'No recommendation returned.'),
      summary: cleanText(candidate.recommendation.summary, 'No summary returned.'),
      confidence,
      supportingEvidence: cleanCount(candidate.recommendation.supportingEvidence),
      challengingEvidence: cleanCount(candidate.recommendation.challengingEvidence)
    },
    sources: candidate.sources.slice(0, 40).map((source, index) => ({
      id: cleanText(source?.id, `source_${index + 1}`),
      kind: cleanText(source?.kind, 'FILE').slice(0, 5).toUpperCase(),
      name: cleanText(source?.name, `Evidence ${index + 1}`),
      meta: cleanText(source?.meta, 'Imported evidence'),
      content: cleanText(source?.content),
      contentStatus: ['full', 'fixture', 'staged', 'metadata'].includes(source?.contentStatus)
        ? source.contentStatus
        : source?.content ? 'full' : 'metadata',
      status: 'ready'
    })),
    signals: candidate.signals.slice(0, 8).map((signal, index) => ({
      index: cleanText(signal?.index, `S-${String(index + 1).padStart(2, '0')}`),
      strength: cleanText(signal?.strength, 'Medium'),
      title: cleanText(signal?.title, 'Untitled signal'),
      body: cleanText(signal?.body, 'No explanation returned.'),
      people: Array.isArray(signal?.people) ? signal.people.slice(0, 3).map(value => cleanText(value, '•')) : ['•'],
      sourceLabel: cleanText(signal?.sourceLabel, 'Imported')
    })),
    proofs: Array.isArray(candidate.proofs) ? candidate.proofs.slice(0, 12).map((proof, index) => ({
      id: cleanText(proof?.id, `proof_${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '_'),
      claim: cleanText(proof?.claim, 'Imported claim'),
      sourceId: cleanText(proof?.sourceId),
      sourceName: cleanText(proof?.sourceName),
      agent: cleanText(proof?.agent, 'Synthesis'),
      status: ['supported', 'qualified', 'challenged', 'blocked'].includes(proof?.status) ? proof.status : 'qualified',
      quote: cleanText(proof?.quote, 'No quote supplied.')
    })) : [],
    contradiction: {
      title: cleanText(candidate.contradiction.title, 'No contradiction returned.'),
      body: cleanText(candidate.contradiction.body, ''),
      forQuote: cleanText(candidate.contradiction.forQuote, 'No supporting quote returned.'),
      againstQuote: cleanText(candidate.contradiction.againstQuote, 'No challenging quote returned.')
    },
    experiment: {
      title: cleanText(candidate.experiment.title, 'No experiment returned.'),
      body: cleanText(candidate.experiment.body, ''),
      window: cleanText(candidate.experiment.window, 'Not specified'),
      metric: cleanText(candidate.experiment.metric, 'Not specified')
    },
    lenses: Array.isArray(candidate.lenses) ? candidate.lenses.slice(0, 5).map((lens, index) => ({
      initials: cleanText(lens?.initials, `L${index + 1}`).slice(0, 3),
      name: cleanText(lens?.name, `Lens ${index + 1}`),
      note: cleanText(lens?.note, 'Imported analysis'),
      vote: cleanText(lens?.vote, 'reviewed')
    })) : [],
    pipeline: Array.isArray(candidate.pipeline) ? candidate.pipeline.slice(0, 8).map(step => ({
      label: cleanText(step?.label, 'Step'), detail: cleanText(step?.detail, 'complete')
    })) : [],
    promises: Array.isArray(candidate.promises) ? candidate.promises.slice(0, 12).map((promise, index) => ({
      agent: cleanText(promise?.agent, `Agent ${index + 1}`),
      initials: cleanText(promise?.initials, `A${index + 1}`).slice(0, 3),
      to: cleanText(promise?.to, 'Observer'),
      body: cleanText(promise?.body, 'No promise body returned.'),
      evidence: cleanText(promise?.evidence, 'No assessment evidence returned.'),
      assessment: ['kept', 'qualified', 'broken'].includes(promise?.assessment) ? promise.assessment : 'qualified'
    })) : [],
    semanticMap: {
      nodes: Array.isArray(candidate.semanticMap?.nodes) ? candidate.semanticMap.nodes.slice(0, 30).map((node, index) => ({
        id: cleanText(node?.id, `node_${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '_'),
        label: cleanText(node?.label, `Node ${index + 1}`).slice(0, 40),
        sub: cleanText(node?.sub, '').slice(0, 30),
        type: ['source', 'agent', 'decision'].includes(node?.type) ? node.type : 'source',
        x: Math.max(40, Math.min(720, Number(node?.x) || 80 + (index % 6) * 110)),
        y: Math.max(40, Math.min(440, Number(node?.y) || 80 + Math.floor(index / 6) * 120)),
        radius: Math.max(20, Math.min(48, Number(node?.radius) || 28))
      })) : [],
      edges: Array.isArray(candidate.semanticMap?.edges) ? candidate.semanticMap.edges.slice(0, 60).map(edge => ({
        from: cleanText(edge?.from).replace(/[^a-zA-Z0-9_-]/g, '_'),
        to: cleanText(edge?.to).replace(/[^a-zA-Z0-9_-]/g, '_'),
        kind: edge?.kind === 'challenges' ? 'challenges' : 'supports'
      })) : []
    }
  };
}

export function unwrapRocketRideResponse(response) {
  const possible = response?.answers?.[0] ?? response?.result?.answers?.[0] ?? response;
  let parsed = possible;
  if (typeof parsed === 'string') {
    const stripped = parsed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    parsed = JSON.parse(stripped);
  }

  // RocketRide's extract_data node intentionally emits a table (an array of
  // rows), even when the requested contract represents one report.
  if (Array.isArray(parsed)) {
    if (parsed.length !== 1) {
      throw new Error(`Expected one RocketRide report row, received ${parsed.length}.`);
    }
    parsed = parsed[0];
  }

  // Keep this compatible with extractors configured as one JSON "report"
  // column as well as the current top-level-field configuration.
  if (isObject(parsed) && Object.hasOwn(parsed, 'report')) {
    parsed = typeof parsed.report === 'string' ? JSON.parse(parsed.report) : parsed.report;
  }

  return parsed;
}
