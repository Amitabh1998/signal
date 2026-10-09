# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Product and engineering leads who need to turn an instruction into a bounded, reviewable software change. They use Signal at the point where a request needs to become a plan, a build, and an accountable pull request.

## Product Purpose

Signal is a software factory. It turns a mission brief and optional source material into a scoped build mission, makes the reasoning inspectable, and can hand an approved mission to a configured local coding runner that writes code, runs tests, and opens a pull request.

## Positioning

Signal connects planning and delivery in one accountable flow: RocketRide scopes the work through configured specialist roles, Promise Theory bounds their commitments, and Semantic Spacetime retains the evidence-to-decision trace before implementation begins.

## Operating Context

The work starts with a plain-language request. Users may attach documents only when those documents materially change the scope. They review the proposed decision and its evidence before approving implementation on an isolated branch. Tests and build results are shown before a pull request is opened.

## Capabilities and Constraints

- RocketRide is a pipeline runtime, not an autonomous orchestrator or a generic agent builder.
- The current RocketRide workflow scopes requests through three parallel specialist LLM roles, then synthesizes and validates a structured report.
- Repository execution is explicitly configured, local, and disabled by default.
- Signal must never imply that a fixture, a staged file, or an imported report was generated live.
- Users need clear paths for documentation, planning, implementation, verification, and pull request creation.

## Brand Commitments

The product name is Signal. The interface must read as a precise, modern software factory rather than an AI chat surface or an ornamental dashboard. The user has rejected yellow and loud acid-green accents, generic card grids, unexplained system status, and controls without a clear role. The first screen must be self-explanatory and calm.

## Evidence on Hand

- The working local web interface and source are in this repository.
- `pipelines/signal-room.pipe` defines the RocketRide workflow.
- `data/recordings/signal-flow/signal-flow.mp4` is a prior demo recording and is not evidence of the current interface.
- Product behavior, constraints, and technical details are documented in `README.md`.

## Product Principles

1. Begin with the human instruction, not a system diagram.
2. Show an output at each consequential gate and defer technical detail until it helps a decision.
3. Keep the user in control of the transition from scoped plan to code execution.
4. Make every claim traceable to evidence or clearly labeled as a demo or local preview.
5. Treat code, tests, and pull requests as part of the product outcome, not a separate handoff.
