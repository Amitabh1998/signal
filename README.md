# Signal

<p align="center">
  <img src="./src/assets/hero.png" alt="Signal" width="180" />
</p>

<p align="center">
  <strong>From product request to evidence-backed scope, tested implementation, and human-reviewed pull request.</strong>
</p>

Signal is a local-first software factory for turning a plain-language product request and supporting evidence into a bounded, reviewable software change.

It uses [RocketRide](https://github.com/rocketride-org) to run explicit decision workflows before and after implementation. Signal keeps the reasoning visible, separates seeded demonstrations from live runs, and leaves consequential transitions—approving scope, enabling repository access, and reviewing a pull request—to a person.

> Signal is currently a development prototype. Repository execution is disabled by default and should only be enabled for an explicitly trusted local repository.

## What Signal does

```text
Product request + evidence
            │
            ▼
   RocketRide scope workflow
            │
            ▼
 Evidence-backed recommendation
   + contradiction + experiment
            │
       human approval
            │
            ▼
 Isolated coding-agent worktree
            │
            ▼
       tests + build
            │
            ▼
 RocketRide delivery review
            │
            ▼
 Pull request for human review
```

The project brings planning and delivery into one inspectable flow:

- **Scope from evidence.** A Customer Advocate, Skeptic, and Product Strategist each analyze the same request and evidence.
- **Expose uncertainty.** Recommendations include supporting evidence, counterarguments, confidence, and a measurable next experiment.
- **Inspect important claims.** Proof links retain source identity and let reviewers open the evidence behind a decision.
- **Approve before building.** A live scope decision becomes a build mission only after a deliberate human handoff.
- **Build in isolation.** The optional coding runner works in a temporary Git worktree created from a configured trusted repository.
- **Review the delivery.** A second RocketRide workflow examines the mission, coding summary, changed files, diff statistics, and recorded quality-gate output before human pull-request review.

## Why it is different

Signal is not an AI chat wrapper and RocketRide is not presented as an autonomous agent. Each component has a narrow job and a visible contract.

| Principle | How Signal applies it |
| --- | --- |
| Evidence before confidence | Important claims point back to supplied source material. |
| Reversible decisions | The scope workflow proposes the smallest measurable next step. |
| Honest provenance | Seed scenarios, staged files, imported reports, and live engine results are labeled differently. |
| Bounded autonomy | Scope approval, repository access, and pull-request review remain human decisions. |
| Reviewable delivery | Tests, build output, the actual patch, and delivery-review findings travel with the implementation. |

## Quick start

Requirements:

- Node.js 20 or newer
- npm

```bash
git clone https://github.com/Amitabh1998/signal.git
cd signal
npm install
npm run dev
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). The included seed scenarios work without an external model or RocketRide server. Choose **Guided tour** in the interface, or open `http://127.0.0.1:4173/?tour=1`.

## Run the live RocketRide workflow

A live analysis requires RocketRide Server v3.4.0 or a compatible RocketRide Cloud endpoint. Copy the example environment file and configure the engine connection:

```bash
cp .env.example .env
```

```dotenv
ROCKETRIDE_URI=ws://localhost:5565
ROCKETRIDE_AUTH=your-engine-key
ROCKETRIDE_APIKEY=your-engine-key
ROCKETRIDE_OPENAI_KEY=your-openai-key
```

Make `ROCKETRIDE_OPENAI_KEY` available to the RocketRide engine process, then verify both pipelines and launch Signal:

```bash
npm run rocketride:check
npm run dev
```

You can also run the scope workflow directly:

```bash
npm run analyze:live -- \
  --input data/sample-evidence.txt \
  --output data/live-report.json
```

Refresh the interface and choose **Load latest live run**. Signal never substitutes a seed report when a live run fails.

## Use the product

1. Enter the product outcome you want to create.
2. Optionally attach TXT, Markdown, JSON, or CSV evidence.
3. Run the scope workflow.
4. Inspect the recommendation, contradiction, proposed experiment, source-linked proof, promise assessments, and execution trace.
5. Approve the decision as a build mission.
6. If trusted repository execution is configured, dispatch the mission to the local coding runner.
7. Review the resulting branch or GitHub pull request yourself.

Browser uploads are staged without pretending they have been analyzed. A live result is shown only after the RocketRide runner returns a valid report.

## The two RocketRide workflows

### Scope decision

[`pipelines/signal-room.pipe`](./pipelines/signal-room.pipe) fans the evidence out to three specialist roles:

```text
evidence → parse
             ├─ customer advocate ─┐
             ├─ skeptic ───────────┼─ promise judge ─ synthesis
             └─ product strategist ┘                      │
                                                          ▼
                                                contract enforcement
                                                          │
                                                          ▼
                                                    decision JSON
```

Parsed evidence reaches each prompt node on its `text` lane, so every role model is called once, after its prompt is fully assembled. Signal records the engine's flow events during the run and shows them as the workflow trace and timeline.

The resulting report contains a recommendation, confidence, sources, signals, proof claims, a contradiction, a reversible experiment, promise assessments, and a semantic relationship map.

### Delivery review

[`pipelines/delivery-review.pipe`](./pipelines/delivery-review.pipe) evaluates the implementation handoff separately:

```text
mission + coding summary + diff stat + quality-gate output
                     │
                     ├─ change reviewer ───┐
                     ├─ quality gatekeeper ┼─ reconciliation → review JSON
                     └─ release skeptic ───┘
```

Its verdict describes readiness for **human pull-request review**. It never authorizes deployment or release.

## Optional repository execution

Signal can hand an approved mission to a local coding agent, headless Claude Code by default or Codex CLI, but only when execution is explicitly enabled for one trusted repository:

```dotenv
SIGNAL_EXECUTION_ENABLED=1
SIGNAL_EXECUTION_REPO=/absolute/path/to/trusted/repository
SIGNAL_EXECUTION_BASE=main
SIGNAL_EXECUTION_REMOTE=origin
SIGNAL_EXECUTION_RUNNER=claude   # or codex

SIGNAL_DELIVERY_REVIEW_ENABLED=1
SIGNAL_DELIVERY_REVIEW_REQUIRED=0
```

The runner:

1. Fetches the configured base branch.
2. Creates an isolated `signal/*` worktree and branch.
3. Dispatches the bounded mission to the configured coding agent. Claude Code runs with edits auto-accepted in the worktree and shell access limited to `npm test`, `npm run build`, and read-only git.
4. Runs `npm test` and `npm run build` when those scripts exist.
5. Captures the changed-file list, diff statistics, and quality-gate output.
6. Optionally runs the RocketRide delivery review.
7. Commits and pushes the branch.
8. Uses authenticated GitHub CLI to open a pull request in GitHub mode.

You need a locally authenticated `claude` (or `codex`) CLI and `gh` CLI for the complete GitHub path. The **Connections** dialog reports local runner availability without moving credentials into Signal.

## Architecture

```text
Browser UI
  ├─ seed scenarios and report views
  ├─ evidence staging
  └─ mission approval
          │ local HTTP
          ▼
Node development server
  ├─ request and evidence handoff
  ├─ RocketRide process adapter
  └─ optional repository executor
          │
          ├─ RocketRide Server → structured scope/delivery reports
          └─ Claude Code/Codex + Git + GitHub CLI → reviewable code change
```

Important directories:

| Path | Purpose |
| --- | --- |
| `src/` | Browser application, report contracts, evidence utilities, and seed scenarios |
| `scripts/` | Local server, RocketRide runners, evaluations, demo tooling, and repository execution |
| `pipelines/` | RocketRide scope and delivery-review workflow definitions |
| `data/scenarios/` | Deterministic seed inputs used for honest product demonstrations |
| `data/source-packs/` | Rich example evidence bundles |
| `tests/` | Contract and behavior tests |

## Promise Theory and Semantic Spacetime

Signal uses **Promise Theory** as an operational design constraint. Each specialist promises a bounded behavior—such as citing evidence, surfacing rival explanations, or proposing a reversible experiment—and the returned promise ledger makes those commitments reviewable.

**Semantic Spacetime** is represented as an explicit support/challenge topology between evidence, specialist findings, and decisions. The visualization explains declared adjacency; it does not claim that visual proximity proves causality.

This is an applied product interpretation of Mark Burgess and Jan Bergstra's work. See [Promise Theory](https://markburgess.org/promises.html) and [Promise Theory: Principles and Applications](https://markburgess.org/BookOfPromises.pdf).

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Signal on port 4173 |
| `npm test` | Run the Node test suite |
| `npm run eval` | Check evidence, proof, and confidence invariants |
| `npm run build` | Build the static application into `dist/` |
| `npm run rocketride:check` | Verify engine connectivity and both pipelines |
| `npm run analyze:live` | Produce a live scope report from an evidence bundle |
| `npm run delivery-review:live` | Review a prepared implementation-delivery bundle |
| `npm run seed:scenario -- --list` | List deterministic demo scenarios |
| `npm run sources:demo` | Generate the rich security-center source pack |
| `npm run demo:record` | Render the end-to-end product walkthrough |

## Verification

```bash
npm test
npm run eval
npm run build
```

The evaluation checks the project's core trust contract: proof claims must reference real sources, available quotes must occur in their source text, visible signals must retain source labels, and skeptical evidence must prevent absolute confidence.

## Safety and current limits

- Keep the development server on localhost. Do not expose it to an untrusted network, especially when repository execution is enabled.
- Repository execution is off by default and is intended only for a repository you explicitly trust.
- Signal runs the target repository's npm test/build scripts only when they are configured; their presence does not replace human code review.
- A delivery-review verdict informs pull-request review. It is not a release or deployment approval.
- Imported JSON can declare itself live. The UI validates its shape but cannot independently prove external provenance.
- Spreadsheet parsing, PDF extraction, and image OCR are not implemented. Supported browser inputs are TXT, Markdown, JSON, and CSV.
- Live run artifacts such as `data/live-report.json` are local and gitignored.
- The RocketRide engine is not built into the Node application; point Signal at a compatible local or Cloud RocketRide Server.

## Demo assets

Generate a realistic source pack:

```bash
npm run sources:demo
```

Render the current end-to-end walkthrough:

```bash
npm run demo:record
open data/recordings/signal-flow/signal-flow.mp4
```

Generated recordings are local artifacts and are not committed to the repository.
