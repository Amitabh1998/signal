# Signal

**Turn a plain-language product request into an evidence-backed scope, a tested implementation, and a pull request a human reviews.**

Signal is a local-first software factory. You describe the change you want and attach any supporting material. Signal runs a [RocketRide](https://github.com/rocketride-org) workflow that scopes the request through three specialist roles, shows you the decision with the evidence behind it, and, once you approve, can hand the mission to a coding agent that works on an isolated branch, runs your tests, and opens a pull request.

The goal is to make AI-assisted delivery inspectable. Every recommendation links back to its sources, every specialist states what it commits to, and every consequential step (approving scope, letting an agent touch a repository, merging the result) stays with a person.

![Signal: describe the change, attach context, and run the scope workflow](docs/assets/signal-home.png)

> **Status:** development prototype. Seed scenarios run offline with no setup. Live analysis needs a RocketRide server, and repository execution is off by default.

---

## Contents

- [How it works](#how-it-works)
- [Design principles](#design-principles)
- [Quick start](#quick-start)
- [Using Signal](#using-signal)
- [Running live with RocketRide](#running-live-with-rocketride)
- [The RocketRide workflows](#the-rocketride-workflows)
- [Repository execution (optional)](#repository-execution-optional)
- [Architecture](#architecture)
- [Promise Theory and Semantic Spacetime](#promise-theory-and-semantic-spacetime)
- [Commands](#commands)
- [Testing and evaluation](#testing-and-evaluation)
- [Safety and current limits](#safety-and-current-limits)

---

## How it works

```text
  Product request + supporting files
                 │
                 ▼
  ┌──────────────────────────────┐
  │ RocketRide scope workflow    │   Customer Advocate · Skeptic · Product Strategist
  └──────────────────────────────┘
                 │
                 ▼
  Recommendation, confidence, contradiction,
  reversible experiment, source-linked proof
                 │
          ✋ human approves scope
                 │
                 ▼
  ┌──────────────────────────────┐
  │ Coding agent in an isolated  │   git worktree on a signal/* branch
  │ worktree (Codex CLI)         │
  └──────────────────────────────┘
                 │
                 ▼
         npm test · npm run build
                 │
                 ▼
  ┌──────────────────────────────┐
  │ RocketRide delivery review   │   Change Reviewer · Quality Gatekeeper · Release Skeptic
  └──────────────────────────────┘
                 │
                 ▼
  Pull request  ──►  ✋ human review
```

In practice:

1. **Scope from evidence.** Three specialist roles read the same request and evidence in parallel. A synthesis step reconciles them into one structured decision.
2. **Show the uncertainty.** The report includes the recommendation, a confidence level, the strongest counterargument, and the smallest measurable experiment worth running next.
3. **Make claims checkable.** Proof claims carry their source identity, and clicking one opens the passage it came from.
4. **Approve before building.** A live scope decision becomes a build mission only when you explicitly create it.
5. **Build in isolation.** If you have enabled execution for a trusted repository, a coding agent implements the mission on a fresh branch in a temporary worktree.
6. **Review the delivery.** A second RocketRide workflow assesses the mission, the agent's summary, the diff, and the test and build results before the pull request opens.

## Design principles

Signal is not a chat wrapper, and RocketRide is not treated as an autonomous agent. Each component has a narrow job and a contract you can see.

| Principle | What it means in Signal |
| --- | --- |
| **Evidence before confidence** | Important claims point back to the material you supplied, and skeptical evidence prevents absolute confidence. |
| **Reversible decisions** | The scope workflow proposes the smallest next step that can be measured, not a roadmap. |
| **Honest provenance** | Seed demos, staged files, imported reports, and live engine results are labeled differently. Signal never substitutes demo output when a live run fails. |
| **Bounded autonomy** | Approving scope, enabling repository access, and reviewing the pull request are always human decisions. |
| **Reviewable delivery** | Tests, build output, the diff, and the delivery review travel with the implementation into the pull request. |

## Quick start

**Requirements:** Node.js 20 or newer, and npm.

```bash
git clone https://github.com/Amitabh1998/signal.git
cd signal
npm install
npm run dev
```

Open <http://127.0.0.1:4173>.

The bundled seed scenarios work without a model or a RocketRide server, so you can explore the full report right away. Click **Guided tour** in the top bar, or open <http://127.0.0.1:4173/?tour=1>, for a step-by-step walkthrough of the interface.

## Using Signal

1. **Describe the change.** Under **New work order**, name the user, the behavior that should change, and any constraints worth protecting.
2. **Attach supporting files (optional).** Add a brief, spec, notes, or data as TXT, Markdown, JSON, or CSV. Staged files are listed but are not described as analyzed until a live run actually reads them.
3. **Run the scope workflow.** Signal sends the request and files to RocketRide through the local server.
4. **Review the decision.** Inspect the recommendation, contradiction, proposed experiment, promise ledger, and execution trace. Turn on **Proof mode** and click a claim to open the source passage behind it.
5. **Create the build mission.** Approving the decision turns it into a mission with acceptance checks and a build queue.
6. **Run the implementation.** If repository execution is configured, dispatch the mission to the coding agent and follow its progress under **Builds**.
7. **Review the pull request** on GitHub yourself.

The **Connections** dialog shows whether the local Codex and Claude Code CLIs are signed in. On macOS, **Sign in** opens the CLI's own login flow in Terminal, so credentials stay in that CLI's store and never pass through Signal. Builds are currently dispatched to Codex CLI.

## Running live with RocketRide

A live run needs **RocketRide Server v3.4.0** (local or Cloud). The engine is not bundled with this repository.

1. Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

2. Point Signal at your engine:

   ```dotenv
   ROCKETRIDE_URI=ws://localhost:5565
   ROCKETRIDE_AUTH=your-engine-key
   ROCKETRIDE_APIKEY=your-engine-key
   ROCKETRIDE_OPENAI_KEY=your-openai-key
   ```

   `ROCKETRIDE_OPENAI_KEY` must be available to the **RocketRide engine process**, because the pipelines' `llm_openai` nodes read it there.

3. Check the engine and both pipelines, then start Signal:

   ```bash
   npm run rocketride:check   # prints "RocketRide health: PASS" only when everything checks out
   npm run dev
   ```

You can also run the scope workflow from the command line and load the result into the interface:

```bash
# Optional: seed evidence from one of the built-in scenarios
npm run seed:scenario -- --list
npm run seed:scenario -- --scenario browser-workflow-agent

npm run analyze:live -- --input data/seed-evidence.txt --output data/live-report.json
```

Refresh the page and choose **Load latest live run**, or use **Open completed report** to import any report the runner produced.

## The RocketRide workflows

Both workflows follow the same pattern: parse the input, fan out to three specialist LLM roles running concurrently, reconcile their answers, then enforce a JSON contract. RocketRide's `extract_data` node validates the structured output and retries malformed JSON before the result reaches Signal. Every model instruction forbids invented facts and requires the model to state uncertainty when the evidence is thin.

### Scope decision: [`pipelines/signal-room.pipe`](./pipelines/signal-room.pipe)

```text
evidence → parse → question
                   ├─ Customer Advocate ──┐
                   ├─ Skeptic ────────────┼─ synthesis → JSON contract → decision report
                   └─ Product Strategist ─┘
```

The report contains a recommendation, confidence, sources, signals, proof claims, a contradiction, a reversible experiment, promise assessments, and a support/challenge map that relates evidence to the decision.

### Delivery review: [`pipelines/delivery-review.pipe`](./pipelines/delivery-review.pipe)

```text
mission + agent summary + diff stat + test/build results
                       │
                       ├─ Change Reviewer ─────┐
                       ├─ Quality Gatekeeper ──┼─ reconciliation → JSON contract → review report
                       └─ Release Skeptic ─────┘
```

A `ready` verdict means *ready for human pull-request review*. It never authorizes a merge, release, or deployment.

## Repository execution (optional)

Signal does not let browser requests act on your machine unless you configure it to. Enable execution for **one trusted repository** in `.env`:

```dotenv
SIGNAL_EXECUTION_ENABLED=1
SIGNAL_EXECUTION_REPO=/absolute/path/to/trusted/repository
SIGNAL_EXECUTION_BASE=main
SIGNAL_EXECUTION_REMOTE=origin

# Run the RocketRide delivery review before opening the PR
SIGNAL_DELIVERY_REVIEW_ENABLED=1
# Set to 1 to block the PR when the delivery review fails
SIGNAL_DELIVERY_REVIEW_REQUIRED=0
```

When you click **Run implementation**, the local runner:

1. Fetches the base branch from the configured remote.
2. Creates a temporary Git worktree on a new `signal/<run-id>` branch.
3. Runs Codex CLI with the approved mission, restricted to that worktree.
4. Runs `npm test` and `npm run build` if the repository defines them.
5. Records the changed files, diff stats, and command outcomes.
6. Optionally sends that bundle to the RocketRide delivery review.
7. Commits, pushes the branch, and opens a pull request with `gh`, including the review in the PR body.
8. Removes the temporary worktree.

This requires the `codex` CLI and an authenticated GitHub CLI (`gh`).

## Architecture

```text
Browser UI (index.html, src/)
  ├─ work order: request + staged evidence
  ├─ report views: decision, proof, ledger, trace
  └─ mission approval and build status
            │  local HTTP (127.0.0.1 only)
            ▼
Node server (scripts/serve.mjs)
  ├─ POST /api/analyze  ──► scripts/rocketride-run.mjs ──► RocketRide Server
  ├─ POST /api/execute  ──► scripts/signal-execute.mjs ──► Codex · git · gh
  ├─ GET  /api/execution-status
  └─ GET  /api/runners
```

| Path | Contents |
| --- | --- |
| `src/` | Browser app, report contract and validation, evidence utilities, seed scenarios |
| `scripts/` | Local server, RocketRide runners and health check, repository executor, evaluation, demo tooling |
| `pipelines/` | RocketRide scope and delivery-review pipeline definitions |
| `data/scenarios/` | Deterministic seed inputs for honest demos |
| `data/sample-evidence.txt` | Example evidence bundle for a live run |
| `tests/` | Report contract and behavior tests (`node --test`) |

The app is plain JavaScript, HTML, and CSS, with no frontend framework. The only runtime dependency is the [`rocketride`](https://www.npmjs.com/package/rocketride) SDK.

## Promise Theory and Semantic Spacetime

Signal uses ideas from Mark Burgess and Jan Bergstra's work as practical design constraints. It does not attempt a new formalization.

- **Promise Theory.** Each specialist promises only its own behavior: cite evidence, surface a rival explanation, or propose a reversible experiment. The **promise ledger** assesses whether each promise was kept, based on the returned evidence and trace. A prompt is never treated as a guarantee.
- **Semantic Spacetime.** Evidence, roles, and decisions are linked through explicit `supports` and `challenges` relationships. The map shows these declared relationships. It does not suggest that visual proximity or an embedding proves causality.

Further reading: [Promise Theory](https://markburgess.org/promises.html) and [*Promise Theory: Principles and Applications*](https://markburgess.org/BookOfPromises.pdf).

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Signal at `http://127.0.0.1:4173` (set `PORT` to change it) |
| `npm test` | Run the test suite |
| `npm run eval` | Check the evidence, proof, and confidence invariants |
| `npm run build` | Build the static app into `dist/` |
| `npm run rocketride:check` | Verify engine connectivity and validate both pipelines |
| `npm run analyze:live` | Run the scope workflow on an evidence file |
| `npm run delivery-review:live` | Run the delivery review on a prepared delivery bundle |
| `npm run seed:scenario -- --list` | List the deterministic demo scenarios |
| `npm run sources:demo` | Generate a realistic multi-format source pack under `data/source-packs/` |
| `npm run demo:record` | Record an end-to-end walkthrough video of the local app (macOS + Chrome) |

## Testing and evaluation

```bash
npm test
npm run eval
npm run build
```

`npm run eval` enforces Signal's trust contract:

- every proof claim references a real source,
- quoted text actually appears in that source when the source text is available,
- every visible signal keeps its source label, and
- skeptical evidence caps confidence below certainty.

## Safety and current limits

- **Keep the server on localhost.** It binds to `127.0.0.1`. Don't expose it to an untrusted network, especially with execution enabled.
- **Execution is opt-in and limited to one repository.** Point it only at a repository you trust. Passing tests are a quality gate, not a substitute for code review.
- **Delivery review is advisory.** Its verdict informs the pull-request reviewer and never approves a release.
- **Imported reports can't prove where they came from.** The UI validates a report's shape but cannot verify that an arbitrary JSON file really came from RocketRide, and it says so.
- **Input formats.** The browser accepts TXT, Markdown, JSON, and CSV. PDF extraction, image OCR, and spreadsheet parsing are not implemented yet.
- **Local artifacts.** Live outputs such as `data/live-report.json` and rendered recordings are gitignored.
- **Engine not included.** Signal connects to a RocketRide server you run locally or in the cloud. The integration has been validated against RocketRide Server v3.4.0.
