import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { scenarioLibrary, getScenario } from '../src/scenarios.js';

const args = process.argv.slice(2);

function readArg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

if (args.includes('--list')) {
  console.log('Available scenarios:');
  scenarioLibrary.forEach(scenario => {
    console.log(`- ${scenario.id}: ${scenario.title}`);
  });
  process.exit(0);
}

const scenarioId = readArg('--scenario') || scenarioLibrary[0].id;
const scenario = getScenario(scenarioId);
const output = readArg('--output') || 'data/seed-evidence.txt';
const outputPath = resolve(process.cwd(), output);

await mkdir(resolve(process.cwd(), 'data'), { recursive: true });
await writeFile(outputPath, `${scenario.evidenceText}\n`, 'utf8');

console.log(`Seeded scenario: ${scenario.id}`);
console.log(`Evidence file: ${output}`);
console.log(`Audience: ${scenario.decisionType}`);
console.log(`Expected outcome: ${scenario.expectedTitle}`);
console.log(`Main risk: ${scenario.risk}`);
console.log('');
console.log(`Run live analysis: npm run analyze:live -- --input ${output} --output data/live-report.json`);
