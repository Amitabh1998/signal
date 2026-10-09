import { demoReport } from '../src/demo-data.js';
import { normalizeReport, validateReport } from '../src/report.js';

const checks = [];

function check(name, fn) {
  checks.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sourceForProof(report, proof) {
  return report.sources.find(source => source.id === proof.sourceId)
    || report.sources.find(source => source.name === proof.sourceName);
}

check('demo report passes the public JSON contract', () => {
  const result = validateReport(demoReport);
  assert(result.ok, result.errors.join(' '));
});

check('proof claims point to real sources', () => {
  const report = normalizeReport(demoReport);
  assert(report.proofs.length >= 3, 'Expected at least three proof claims.');
  for (const proof of report.proofs) {
    assert(sourceForProof(report, proof), `${proof.id} references no known source.`);
  }
});

check('proof quotes are traceable to source text when source text is embedded', () => {
  const report = normalizeReport(demoReport);
  for (const proof of report.proofs) {
    const source = sourceForProof(report, proof);
    if (!source?.content || proof.quote === 'No quote supplied.') continue;
    assert(source.content.includes(proof.quote), `${proof.id} quote is not present in ${source.name}.`);
  }
});

check('signals carry source labels instead of orphaned claims', () => {
  const report = normalizeReport(demoReport);
  for (const signal of report.signals) {
    assert(signal.sourceLabel && signal.sourceLabel !== 'Imported', `${signal.index} has no useful source label.`);
  }
});

check('skeptic evidence caps certainty below absolute confidence', () => {
  const report = normalizeReport(demoReport);
  const challenged = report.proofs.filter(proof => ['challenged', 'qualified', 'blocked'].includes(proof.status));
  assert(challenged.length > 0, 'Expected at least one skeptical proof claim.');
  assert(report.recommendation.confidence < 90, 'Confidence should stay below 90 when skeptical proof exists.');
});

check('fabricated proof source ids are rejected', () => {
  const result = validateReport({
    ...demoReport,
    proofs: [{ id: 'bad', claim: 'Unsupported claim', sourceId: 'missing_source', agent: 'Synthesis', status: 'supported', quote: 'Nope.' }]
  });
  assert(!result.ok, 'Expected validation to reject an unknown proof source id.');
});

let failures = 0;
for (const item of checks) {
  try {
    await item.fn();
    console.log(`PASS ${item.name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${item.name}`);
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures) {
  console.error(`\nSignal Room eval: FAIL (${failures}/${checks.length})`);
  process.exit(1);
}

console.log(`\nSignal Room eval: PASS (${checks.length}/${checks.length})`);
