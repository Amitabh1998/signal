# Signal end-to-end demo

## Product promise

Signal turns a request and supporting evidence into a source-backed scope decision, an approved build mission, a tested code change, a delivery review, and a pull request for human review.

## Seeded inputs versus real execution

- The browser-agent, invoice, and onboarding packs are committed seed inputs.
- Seed reports are deterministic previews and are always labeled `SEED`.
- A `LIVE RUN` label requires a real RocketRide result, persisted run id, provenance, and engine trace.
- A local review branch proves code generation and Git quality gates but is never called a pull request.
- The final GitHub demo must finish with a real PR URL.

## Prepare the safe coding target

```bash
npm install
npm run demo:target
```

Copy the printed repository values into `.env`. For a local proof run use:

```dotenv
SIGNAL_EXECUTION_ENABLED=1
SIGNAL_EXECUTION_REPO=/absolute/path/printed/by/demo-target
SIGNAL_EXECUTION_BASE=main
SIGNAL_EXECUTION_REMOTE=origin
SIGNAL_EXECUTION_PR_MODE=local
SIGNAL_EXECUTION_RUNNER=claude
```

Use `SIGNAL_EXECUTION_PR_MODE=github` only when the trusted repository has a GitHub remote and `gh auth status` succeeds.

## Configure the live scope and delivery workflows

```dotenv
ROCKETRIDE_URI=ws://localhost:5565
ROCKETRIDE_AUTH=
ROCKETRIDE_APIKEY=MYAPIKEY
ROCKETRIDE_OPENROUTER_KEY=your-openrouter-key
SIGNAL_DELIVERY_REVIEW_ENABLED=1
SIGNAL_DELIVERY_REVIEW_REQUIRED=1
```

Verify the engine and both pipelines:

```bash
npm run rocketride:up
npm run rocketride:check
```

## Demonstration flow

1. Open `http://127.0.0.1:4173`.
2. Enter the browser-workflow request.
3. Attach the seeded text, JSON, and XLSX sources.
4. Run the live scope workflow.
5. Open the real engine trace and parsed spreadsheet evidence.
6. Review the recommendation, contradiction, experiment, verified proof, and independently judged promises.
7. Create the approved build mission.
8. Run implementation against the trusted demo repository.
9. Show the isolated branch, coding-agent change, passing tests/build, actual-diff delivery review, and citation status.
10. Open the real GitHub pull request for human review.

## Verification

```bash
npm test
npm run eval
npm run build
```
