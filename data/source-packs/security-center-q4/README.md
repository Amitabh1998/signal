# Source Pack: Enterprise Security Center vs Integration Backlog

## Topic

Should the team build an audit-ready Security Center before adding another Jira-style integration?

## How to use

Use these files as Signal Room source inputs. They intentionally disagree:

- Enterprise buyers and security reviewers say audit proof blocks rollout.
- Sales and support notes still contain visible integration demand.
- CRM data suggests security blockers carry more revenue impact.

## Files

- `01-customer-call-nadia-finlytics.md`: security review call transcript
- `02-customer-call-marcus-heliobank.md`: enterprise buyer call transcript
- `03-product-research-summary.md`: PM synthesis notes
- `04-support-tickets.jsonl`: ticket export
- `05-enterprise-pipeline.csv`: spreadsheet-friendly opportunity data
- `05-enterprise-pipeline.xlsx`: Excel workbook version of the same data
- `screenshots/*.png`: generated product/admin screenshots
- `hyperframes/security-center-clip/index.html`: HyperFrames-style clip composition

## Expected Signal Room outcome

Recommendation: build an audit-ready Security Center first, with exportable audit logs, retention controls, and SCIM status. Keep integration demand visible as a risk, but do not let it outrank security-review blockers.
