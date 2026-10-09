# Promise Factory Demo Script

## One-line pitch

Promise Factory turns one active software idea into a build-ready agent-product blueprint before anyone writes code.

## Active demo topic

**Build a browser workflow agent that watches a user complete a repetitive browser task once, then turns it into a reusable automation with checks, approvals, and handoff notes.**

This is more demoable than a static admin/security use case because the audience can immediately picture the clip:

1. A human enriches one lead in the browser.
2. The agent watches the steps.
3. RocketRide coordinates specialist teams.
4. The product returns a blueprint: requirements, flows, architecture, security gates, tests, observability, and build queue.

## Best 90-second walkthrough

1. Open `http://127.0.0.1:4173`.
2. Say: "This is Promise Factory. It does not jump straight from prompt to code. It first generates the full product blueprint."
3. Click **Load factory idea**.
4. Click **Generate blueprint** or **Run agent teams**.
5. Show the 12 generated artifacts.
6. Point to **Conflict resolution**: autonomy vs trust, robust replay, data safety.
7. Point to **Readiness gates**: this is what makes it build-ready instead of just a pretty prompt.
8. Scroll to **Choose the workflow wedge** and show the source packs: lead enrichment, invoice matching, onboarding checks.
9. Click **Load latest live run** to show the RocketRide-generated result from `data/live-report.json`.
10. Open **Proof mode** and click proof claims to show source-backed reasoning.

## Talk track

> "Most coding agents start too late. They jump from a vague idea to implementation. Promise Factory starts earlier: it coordinates product, architecture, security, QA, observability, and deployment agents into one build-ready package. The demo idea is a browser workflow agent: watch one successful human run, infer steps and variables, add checks, then replay only after approval."

## Live RocketRide run

```bash
npm run seed:scenario -- --scenario browser-workflow-agent
npm run analyze:live -- --input data/seed-evidence.txt --output data/live-report.json
npm run rocketride:check
```

Then refresh the app and click **Load latest live run**.

## Recorded walkthrough

```bash
npm run demo:record
open data/recordings/promise-factory-flow/promise-factory-flow.mp4
```

This regenerates the RocketRide intro, Promise Theory / Semantic Spacetime explainer, captured frames, real DOM-measured click targets, HyperFrames composition, subtitles, narration, and final 54-second MP4 from the current local UI.

## What to emphasize

- **Active use case:** browser work becomes an agent workflow.
- **RocketRide role:** coordinates specialist agents and validates the output contract.
- **Founder value:** a raw idea becomes a build plan with risks, gates, and next tasks.
- **Trust:** the product shows conflicts, proof, and approval gates instead of hiding behind "AI magic."

## Verification

```bash
npm test
npm run eval
npm run build
```
