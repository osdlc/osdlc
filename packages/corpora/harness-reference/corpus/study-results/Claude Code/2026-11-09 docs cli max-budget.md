---
kind: docs
reportedIn:
  - "[Claude Code docs CLI reference](../../documents/code.claude.com/Claude%20Code%20docs%20CLI%20reference.md)"
version: 2.1.319
version_basis: inferred
locator: CLI flags, --max-budget-usd
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
observed: 2026-11-09
excerpt:
  exact: --max-budget-usd Stop the run once estimated spend on API calls reaches this amount (print mode only). Claude Code checks the cap against its client-side cost estimate, which can differ from your bill. Spend from subagents counts toward the cap. Spend can pass the cap, so leave headroom.
  prefix: 'claude -p --maintenance "query" '
  suffix: " When you return to a conversati"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T07:53:54Z
---

> --max-budget-usd Stop the run once estimated spend on API calls reaches this amount (print mode only). Claude Code checks the cap against its client-side cost estimate, which can differ from your bill. Spend from subagents counts toward the cap. Spend can pass the cap, so leave headroom.
