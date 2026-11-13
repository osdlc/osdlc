---
kind: docs
reportedIn:
  - "[Claude Code docs CLI reference](../../documents/code.claude.com/Claude%20Code%20docs%20CLI%20reference.md)"
version: 2.1.319
version_basis: inferred
locator: CLI flags, --max-turns
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
observed: 2026-11-09
excerpt:
  exact: --max-turns Limit the number of agentic turns (print mode only). No limit by default. With --input-format stream-json, a message still queued when the limit ends a turn stays queued and starts a new turn with its own limit
  prefix: 'p --max-budget-usd 5.00 "query" '
  suffix: ' claude -p --max-turns 3 "query"'
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T07:53:54Z
---

> --max-turns Limit the number of agentic turns (print mode only). No limit by default. With --input-format stream-json, a message still queued when the limit ends a turn stays queued and starts a new turn with its own limit
