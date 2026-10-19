import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

// npm run verify:e2e [-- --skip-build] [--headed] [--url http://127.0.0.1:4173]
// Drives the real UI end to end against a running Signal server and RocketRide
// engine: scope run with the demo source pack, then (unless --skip-build) the
// implementation run on the configured trusted repository.
const args = process.argv.slice(2);
const option = name => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : undefined; };
const url = option('url') || 'http://127.0.0.1:4173';
const skipBuild = args.includes('--skip-build');
const chromePath = process.env.CHROME_PATH || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].find(existsSync);
const shots = resolve('data/recordings/e2e');
const pack = resolve('data/source-packs/security-center-q4');
const request = 'Let operations teams turn a repeated browser task into an approved automation: watch one successful run, infer the steps and variables, and replay it only after a human approves each checkpoint.';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const health = await fetch(`${url}/api/health`).then(response => response.json()).catch(() => null);
if (!health) throw new Error(`Signal is not reachable at ${url}. Start it with npm run dev.`);
if (!health.engine.ok) throw new Error(`RocketRide is not ready: ${health.engine.code} ${health.engine.message || ''}`);
if (!chromePath) throw new Error('Chrome was not found; set CHROME_PATH.');

await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: chromePath, headless: !args.includes('--headed') });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
const shot = name => page.screenshot({ path: join(shots, `${name}.png`) });

try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.fill('#factoryIdeaInput', request);
  await page.setInputFiles('#fileInput', ['01-customer-call-nadia-finlytics.md', '04-support-tickets.jsonl', '05-enterprise-pipeline.xlsx'].map(file => join(pack, file)));
  check('three files staged', (await page.locator('#attachmentListItems li').count()) === 3);

  // Scope run: watch the live graph light up step by step.
  await page.click('#factoryGenerateButton');
  await page.waitForSelector('#liveFlow:not([hidden])', { timeout: 5000 });
  const seenActive = new Set();
  const scopeDeadline = Date.now() + 240_000;
  while (Date.now() < scopeDeadline) {
    for (const step of await page.locator('[data-flow-step].active').evaluateAll(nodes => nodes.map(node => node.dataset.flowStep))) seenActive.add(step);
    const state = await page.textContent('#liveFlowState');
    if (/ready for human review|Stopped|Cancelled/.test(state)) break;
    await page.waitForTimeout(250);
  }
  await shot('01-live-graph-final');
  check('live graph showed steps one at a time', seenActive.size >= 4, [...seenActive].join(' → '));
  check('scope run completed', /ready for human review/.test(await page.textContent('#liveFlowState')));
  await page.waitForSelector('.truth-banner', { timeout: 10_000 });
  check('report labelled LIVE RUN', /live/i.test(await page.textContent('.truth-banner')));

  await page.click('.scope-trace summary');
  await shot('02-how-produced');
  const parsedRows = await page.locator('#parsedEvidence .parsed-sheet tbody tr').count();
  check('Parsed by RocketRide table', parsedRows > 0 && /Parsed by RocketRide/.test(await page.textContent('#parsedEvidence')), `${parsedRows} rows`);
  const offsets = await page.locator('#engineTimelineRows li em').allTextContents();
  const seconds = offsets.map(text => Number.parseFloat(text.replace('+', '')));
  check('timeline offsets increase', seconds.length >= 6 && seconds.every((value, index) => index === 0 || value >= seconds[index - 1]), offsets.join(' '));

  const proofs = await page.locator('.proof-item span').allTextContents();
  check('proof claims verified or flagged', proofs.length > 0 && proofs.every(text => /verbatim|paraphrase|unverified/i.test(text)), proofs.join(' | '));
  await page.click('[data-view="promiseView"]');
  check('ledger graded by the Promise Judge', /independent Promise Judge/.test(await page.textContent('#promiseGrader')));
  await page.click('[data-view="semanticView"]');
  check('semantic map draws declared paths', (await page.locator('.semantic-node').count()) >= 3);
  await shot('03-semantic');
  await page.click('[data-view="decisionView"]');
  check('Decisions view lists live runs', (await page.locator('#liveDecisionGrid .live-decision').count()) >= 1);

  if (!skipBuild) {
    await page.click('#createMissionReviewButton');
    await page.waitForSelector('#buildMission:not([hidden])', { timeout: 10_000 });
    await page.waitForFunction(() => !document.querySelector('#dispatchExecutionButton').disabled, null, { timeout: 15_000 });
    await page.click('#dispatchExecutionButton');
    const started = await page.waitForFunction(() => document.querySelector('#cancelExecutionButton')?.hidden === false, null, { timeout: 30_000 }).then(() => true, () => false);
    if (!started) throw new Error(`Implementation did not start: ${await page.textContent('#executionState')}`);
    await page.waitForFunction(() => document.querySelector('#cancelExecutionButton').hidden, null, { timeout: 1_200_000 });
    await shot('04-implementation-final');
    const branch = await page.textContent('#executionPr');
    check('implementation pushed a review branch or opened a PR', /signal\/|Ready for review/.test(branch), branch);
    check('diff reader agent read the commit', /Matches the commit Signal recorded/.test(await page.textContent('#deliveryReviewPanel').catch(() => '')));
    const verified = await page.locator('#deliveryReviewPanel .citation.verified').count();
    const unverified = await page.locator('#deliveryReviewPanel .citation.unverified').count();
    // Signal flags any citation outside the commit; most should land inside it.
    check('review citations found in the commit', verified > 0 && unverified <= verified / 4, `${verified} found, ${unverified} flagged as not found`);
  }
  check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
} finally {
  await browser.close();
}

const failed = results.filter(result => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${shots}`);
process.exitCode = failed.length ? 1 : 0;
