import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const root = resolve(process.cwd(), 'data/source-packs/security-center-q4');
const screenshots = join(root, 'screenshots');
const hyperframes = join(root, 'hyperframes/security-center-clip');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const text = {
  readme: `# Source Pack: Enterprise Security Center vs Integration Backlog

## Topic

Should the team build an audit-ready Security Center before adding another Jira-style integration?

## How to use

Use these files as Signal Room source inputs. They intentionally disagree:

- Enterprise buyers and security reviewers say audit proof blocks rollout.
- Sales and support notes still contain visible integration demand.
- CRM data suggests security blockers carry more revenue impact.

## Files

- \`01-customer-call-nadia-finlytics.md\`: security review call transcript
- \`02-customer-call-marcus-heliobank.md\`: enterprise buyer call transcript
- \`03-product-research-summary.md\`: PM synthesis notes
- \`04-support-tickets.jsonl\`: ticket export
- \`05-enterprise-pipeline.csv\`: spreadsheet-friendly opportunity data
- \`05-enterprise-pipeline.xlsx\`: Excel workbook version of the same data
- \`screenshots/*.png\`: generated product/admin screenshots
- \`hyperframes/security-center-clip/index.html\`: HyperFrames-style clip composition

## Expected Signal Room outcome

Recommendation: build an audit-ready Security Center first, with exportable audit logs, retention controls, and SCIM status. Keep integration demand visible as a risk, but do not let it outrank security-review blockers.
`,
  nadia: `# Customer Call Transcript: Nadia - Finlytics

Date: 2026-09-29
Length: 42 minutes
Participants: Nadia Patel, Security Lead; Rowan Price, Account Executive; Mina Zhou, Product

## Summary

Finlytics wants to expand from a 25-seat pilot to 180 seats, but security approval is blocked. The current workflow coverage is strong enough for expansion. The blocker is audit evidence.

## Transcript Excerpts

Nadia: We like the workflow coverage. The issue is not whether the team can use the product. The issue is whether I can approve broader rollout.

Mina: What would unblock approval?

Nadia: I need an exportable access log, retention settings, and a page that shows who touched customer data. Screenshots from a support engineer will not pass our review.

Rowan: Would a Jira integration help with the current review?

Nadia: Jira is useful later. It is not the approval blocker. My committee asked about audit trails before they asked about any new integration.

## Product Signal

Security proof is the approval gate. Integration demand exists, but it is not the primary rollout blocker for this account.
`,
  marcus: `# Customer Call Transcript: Marcus - HelioBank

Date: 2026-10-02
Length: 35 minutes
Participants: Marcus Lee, Director of Operations; Priya Sethi, Solutions Engineer

## Summary

HelioBank is evaluating a 90-seat rollout. The buyer likes the Salesforce integration and asked about Jira, but the review sequence prioritizes security controls.

## Transcript Excerpts

Marcus: The Salesforce integration is nice. Jira would reduce manual handoffs for our operations team.

Priya: If we shipped Jira first, would that accelerate rollout?

Marcus: Not by itself. Our security committee asked about retention, audit trails, and SCIM before they asked about any new app. We cannot add the broader team until that review closes.

Priya: What proof format do they want?

Marcus: Exportable logs, role-change history, and a single admin page that says what controls are enabled. They prefer self-serve evidence over a custom slide deck.

## Product Signal

Integration requests are visible, but enterprise approval depends on self-serve security evidence.
`,
  research: `# Product Research Summary

Prepared by: Research Ops
Date: 2026-10-05

## Decision Question

Should Q4 focus on an audit-ready Security Center or a Jira-style integration?

## Evidence Readout

Security-review blockers appear in 11 opportunities worth $1.8M in pipeline. Missing integrations appear as the primary blocker in 3 opportunities worth $410K. Support tickets mention Jira, but ticket language is often solution-shaped rather than outcome-shaped.

## Patterns

1. Security reviewers ask for exportable proof, not verbal assurance.
2. Buyers mention integrations more often in demos, but security teams control rollout approval.
3. Solutions engineering can partially bridge integration gaps with manual exports.
4. Audit logs, retention controls, and SCIM status need product support because screenshots and slide decks are not accepted.

## Contradiction

The integration backlog is louder. The security blocker is more expensive.

## Suggested Experiment

Ship a read-only Security Center to three enterprise evaluations. Include access-log export, retention settings, role-change history, and SCIM status. Measure review-cycle time and expansion approval rate over 30 days.
`
};

const tickets = [
  { id: 'TCK-1842', account: 'Finlytics', type: 'security', priority: 'P0', status: 'blocked', evidence: 'Need exportable access logs before rollout approval.', revenueRisk: 420000 },
  { id: 'TCK-1845', account: 'HelioBank', type: 'security', priority: 'P0', status: 'blocked', evidence: 'Security committee asked for retention, SCIM, and audit trails.', revenueRisk: 310000 },
  { id: 'TCK-1851', account: 'Northstar Risk', type: 'integration', priority: 'P2', status: 'open', evidence: 'Requester asked for Jira issue sync to reduce manual handoff.', revenueRisk: 90000 },
  { id: 'TCK-1854', account: 'Arcade Cloud', type: 'security', priority: 'P1', status: 'open', evidence: 'Admin needs role-change history for quarterly audit.', revenueRisk: 180000 },
  { id: 'TCK-1860', account: 'OrbitOps', type: 'integration', priority: 'P2', status: 'open', evidence: 'Zendesk webhook requested by support operations.', revenueRisk: 70000 },
  { id: 'TCK-1864', account: 'Kestrel Finance', type: 'security', priority: 'P0', status: 'blocked', evidence: 'SOC2 reviewer rejected screenshot-based audit evidence.', revenueRisk: 260000 }
];

const pipelineRows = [
  ['Opportunity', 'Account', 'Segment', 'ARR', 'Primary blocker', 'Requested feature', 'Stage', 'Owner'],
  ['OPP-901', 'Finlytics', 'Enterprise', '420000', 'Security review', 'Access-log export', 'Security review', 'Rowan'],
  ['OPP-914', 'HelioBank', 'Enterprise', '310000', 'Security review', 'Retention controls', 'Security review', 'Priya'],
  ['OPP-922', 'Northstar Risk', 'Enterprise', '90000', 'Missing integration', 'Jira sync', 'Technical validation', 'Sam'],
  ['OPP-936', 'Kestrel Finance', 'Enterprise', '260000', 'Security review', 'Audit evidence hub', 'Legal/security', 'Ira'],
  ['OPP-941', 'BrightCart', 'Mid-market', '70000', 'Missing integration', 'Zendesk webhook', 'Business case', 'Noor'],
  ['OPP-948', 'Cobalt Health', 'Enterprise', '190000', 'Security review', 'SCIM status page', 'Security review', 'Rowan'],
  ['OPP-955', 'ClearLedger', 'Enterprise', '230000', 'Security review', 'Role-change history', 'Procurement', 'Mina'],
  ['OPP-963', 'OrbitOps', 'Mid-market', '250000', 'Missing integration', 'Jira sync', 'Technical validation', 'Sam']
];

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeHtml(value) {
  return escapeXml(value).replaceAll("'", '&#039;');
}

async function ensureDirs() {
  await mkdir(root, { recursive: true });
  await mkdir(screenshots, { recursive: true });
  await mkdir(hyperframes, { recursive: true });
}

function csvCell(value) {
  const textValue = String(value);
  return /[",\n]/.test(textValue) ? `"${textValue.replaceAll('"', '""')}"` : textValue;
}

async function writeTextSources() {
  await writeFile(join(root, 'README.md'), text.readme, 'utf8');
  await writeFile(join(root, '01-customer-call-nadia-finlytics.md'), text.nadia, 'utf8');
  await writeFile(join(root, '02-customer-call-marcus-heliobank.md'), text.marcus, 'utf8');
  await writeFile(join(root, '03-product-research-summary.md'), text.research, 'utf8');
  await writeFile(join(root, '04-support-tickets.jsonl'), tickets.map(ticket => JSON.stringify(ticket)).join('\n') + '\n', 'utf8');
  await writeFile(join(root, '05-enterprise-pipeline.csv'), pipelineRows.map(row => row.map(csvCell).join(',')).join('\n') + '\n', 'utf8');
}

async function writeXlsx() {
  const tmp = await mkdtemp(join(tmpdir(), 'signal-room-xlsx-'));
  const rels = join(tmp, '_rels');
  const xl = join(tmp, 'xl');
  const worksheets = join(xl, 'worksheets');
  await mkdir(rels, { recursive: true });
  await mkdir(worksheets, { recursive: true });
  await mkdir(join(xl, '_rels'), { recursive: true });

  const sheetData = pipelineRows.map((row, rowIndex) => {
    const cells = row.map((cell, colIndex) => {
      const ref = `${String.fromCharCode(65 + colIndex)}${rowIndex + 1}`;
      return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(cell)}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');

  await writeFile(join(tmp, '[Content_Types].xml'), `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`, 'utf8');
  await writeFile(join(rels, '.rels'), `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`, 'utf8');
  await writeFile(join(xl, 'workbook.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Enterprise Pipeline" sheetId="1" r:id="rId1"/></sheets>
</workbook>`, 'utf8');
  await writeFile(join(xl, '_rels', 'workbook.xml.rels'), `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`, 'utf8');
  await writeFile(join(worksheets, 'sheet1.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:H${pipelineRows.length}"/>
  <sheetData>${sheetData}</sheetData>
</worksheet>`, 'utf8');

  const output = join(root, '05-enterprise-pipeline.xlsx');
  if (existsSync(output)) await rm(output);
  execFileSync('/usr/bin/zip', ['-qr', output, '.'], { cwd: tmp });
  await rm(tmp, { recursive: true, force: true });
}

function screenshotTemplate(kind) {
  const variants = {
    security: {
      title: 'Security Review Portal',
      subtitle: 'Finlytics enterprise rollout',
      accent: '#b8ff3d',
      rows: [
        ['Access log export', 'Missing', 'Blocks approval'],
        ['Retention controls', 'Missing', 'Reviewer requested'],
        ['SCIM status', 'Partial', 'Needs admin proof'],
        ['Role change history', 'Missing', 'Quarterly audit']
      ],
      callout: 'Security approval cannot close without exportable evidence.'
    },
    audit: {
      title: 'Admin Audit Log',
      subtitle: 'Current product state',
      accent: '#79d8cf',
      rows: [
        ['Sep 29 10:14', 'Role changed', 'Not exportable'],
        ['Sep 29 10:17', 'Data export viewed', 'No actor detail'],
        ['Oct 02 14:33', 'SCIM sync failed', 'Hidden from admins'],
        ['Oct 04 09:20', 'Retention policy opened', 'No history']
      ],
      callout: 'Useful signals exist, but admins cannot package them for review.'
    },
    integration: {
      title: 'Integration Request Queue',
      subtitle: 'Support and sales backlog',
      accent: '#ffb35c',
      rows: [
        ['Jira sync', '3 accounts', '$340K influenced'],
        ['Zendesk webhook', '1 account', '$70K influenced'],
        ['Slack alerts', '2 accounts', '$120K influenced'],
        ['Salesforce field map', '1 account', '$80K influenced']
      ],
      callout: 'Integration demand is visible, but smaller than blocked security pipeline.'
    }
  };
  const data = variants[kind];
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@500;700&display=swap');
      * { box-sizing: border-box; }
      body { margin: 0; width: 1280px; height: 760px; display: grid; place-items: center; color: #f3f5ee; background: #08100c; font-family: Manrope, sans-serif; }
      .screen { width: 1120px; height: 620px; padding: 34px; border: 1px solid #29362e; border-radius: 24px; background: radial-gradient(circle at 85% 12%, rgba(184,255,61,.13), transparent 32%), #101813; box-shadow: 0 30px 120px rgba(0,0,0,.45); }
      .top { display: flex; justify-content: space-between; align-items: center; padding-bottom: 24px; border-bottom: 1px solid #253129; }
      .eyebrow { color: ${data.accent}; font: 500 15px/1 'DM Mono', monospace; letter-spacing: .1em; text-transform: uppercase; }
      h1 { margin: 11px 0 0; font-size: 46px; letter-spacing: -.04em; }
      .pill { padding: 12px 16px; border: 1px solid ${data.accent}; border-radius: 999px; color: ${data.accent}; font: 500 14px 'DM Mono', monospace; }
      table { width: 100%; margin-top: 28px; border-collapse: collapse; overflow: hidden; border: 1px solid #26322b; border-radius: 14px; }
      td { padding: 20px 18px; border-bottom: 1px solid #26322b; color: #b9c1b9; font-size: 19px; }
      td:first-child { color: #f3f5ee; font-weight: 700; }
      td:last-child { color: ${data.accent}; font-family: 'DM Mono', monospace; font-size: 15px; text-align: right; }
      .callout { margin-top: 28px; padding: 22px 24px; border: 1px solid rgba(184,255,61,.24); border-radius: 16px; background: rgba(184,255,61,.08); color: #dce6d6; font-size: 21px; }
    </style>
  </head>
  <body>
    <section class="screen">
      <div class="top">
        <div><span class="eyebrow">${escapeHtml(data.subtitle)}</span><h1>${escapeHtml(data.title)}</h1></div>
        <div class="pill">Q4 evidence</div>
      </div>
      <table>${data.rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</table>
      <div class="callout">${escapeHtml(data.callout)}</div>
    </section>
  </body>
</html>`;
}

async function screenshot(htmlPath, outputPath, width = 1280, height = 760) {
  if (!existsSync(chrome)) return false;
  const result = spawnSync(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--disable-background-networking',
    `--window-size=${width},${height}`,
    '--virtual-time-budget=2000',
    `--screenshot=${outputPath}`,
    `file://${htmlPath}`
  ], { encoding: 'utf8' });
  return result.status === 0 || existsSync(outputPath);
}

async function writeScreenshots() {
  for (const [kind, file] of [
    ['security', 'security-review-portal.png'],
    ['audit', 'admin-audit-log.png'],
    ['integration', 'integration-request-queue.png']
  ]) {
    const html = join(screenshots, `${kind}.html`);
    await writeFile(html, screenshotTemplate(kind), 'utf8');
    await screenshot(html, join(screenshots, file));
  }
}

async function writeHyperframesClip() {
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=1080, initial-scale=1" />
    <title>Signal Room Security Center Clip</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@500;700;800&display=swap');
      * { box-sizing: border-box; }
      body { margin: 0; width: 1080px; height: 1920px; overflow: hidden; color: #f2f3ee; background: #07100b; font-family: Manrope, sans-serif; }
      .stage { position: relative; width: 1080px; height: 1920px; padding: 94px 76px; background: radial-gradient(circle at 75% 18%, rgba(184,255,61,.2), transparent 28%), linear-gradient(180deg, #0f1712, #060a08); }
      .brand { display: flex; align-items: center; gap: 18px; color: #c9ff4a; font: 500 24px 'DM Mono', monospace; text-transform: uppercase; letter-spacing: .08em; }
      .mark { width: 42px; height: 42px; border: 1px solid #c9ff4a; transform: rotate(45deg); }
      .clip { position: absolute; left: 76px; right: 76px; opacity: 0; transform: translateY(28px); animation: enter .6s ease forwards; }
      .hero { top: 210px; }
      .hero h1 { margin: 28px 0 0; font-size: 94px; line-height: .98; letter-spacing: -.06em; }
      .hero p { width: 820px; margin: 28px 0 0; color: #aab4aa; font-size: 33px; line-height: 1.45; }
      .evidence { top: 800px; display: grid; grid-template-columns: 1fr 1fr; gap: 18px; animation-delay: 2.4s; }
      .card { min-height: 188px; padding: 28px; border: 1px solid #2a382e; border-radius: 22px; background: rgba(17,25,19,.82); }
      .card b { display: block; color: #c9ff4a; font: 500 22px 'DM Mono', monospace; text-transform: uppercase; }
      .card span { display: block; margin-top: 24px; font-size: 32px; line-height: 1.22; }
      .decision { top: 1290px; padding: 34px; border: 1px solid rgba(201,255,74,.42); border-radius: 28px; background: linear-gradient(145deg, rgba(201,255,74,.14), rgba(17,25,19,.9)); animation-delay: 5.2s; }
      .decision small { color: #c9ff4a; font: 500 22px 'DM Mono', monospace; text-transform: uppercase; }
      .decision h2 { margin: 22px 0 0; font-size: 62px; line-height: 1.05; letter-spacing: -.05em; }
      .footer { bottom: 80px; color: #788278; font: 500 23px 'DM Mono', monospace; animation-delay: 7.8s; }
      @keyframes enter { to { opacity: 1; transform: translateY(0); } }
    </style>
  </head>
  <body>
    <main class="stage">
      <div class="brand"><i class="mark"></i><span>Signal Room</span></div>
      <section class="clip hero" data-start="0" data-duration="3" data-track-index="1">
        <h1>The integration backlog is loud.</h1>
        <p>But the bigger deals are blocked by security review.</p>
      </section>
      <section class="clip evidence" data-start="2.4" data-duration="3" data-track-index="2">
        <article class="card"><b>Security proof</b><span>$1.8M pipeline blocked by audit logs, retention, and SCIM.</span></article>
        <article class="card"><b>Integrations</b><span>$410K influenced by Jira and webhook requests.</span></article>
        <article class="card"><b>Customer quote</b><span>"Jira is useful later. It is not the approval blocker."</span></article>
        <article class="card"><b>Ticket signal</b><span>7 audit-log requests vs 2 Jira requests in the blocker export.</span></article>
      </section>
      <section class="clip decision" data-start="5.2" data-duration="2.6" data-track-index="3">
        <small>Recommended bet</small>
        <h2>Build an audit-ready Security Center before another integration.</h2>
      </section>
      <div class="clip footer" data-start="7.8" data-duration="1.2" data-track-index="4">Evidence -> conflict -> defensible decision</div>
    </main>
  </body>
</html>`;
  await writeFile(join(hyperframes, 'index.html'), html, 'utf8');
  await writeFile(join(hyperframes, 'README.md'), `# HyperFrames Clip: Security Center Decision

This is a HyperFrames-style HTML composition for a short vertical product-decision clip.

Preview:

\`\`\`bash
open data/source-packs/security-center-q4/hyperframes/security-center-clip/index.html
\`\`\`

Render with HyperFrames when the CLI is installed:

\`\`\`bash
npx hyperframes render data/source-packs/security-center-q4/hyperframes/security-center-clip --output data/source-packs/security-center-q4/hyperframes/security-center-clip/security-center-decision.mp4
\`\`\`
`, 'utf8');
  await screenshot(join(hyperframes, 'index.html'), join(hyperframes, 'clip-preview.png'), 1080, 1920);
}

await ensureDirs();
await writeTextSources();
await writeXlsx();
await writeScreenshots();
await writeHyperframesClip();

console.log(`Generated source pack at ${root}`);
