# Product Research Summary

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
