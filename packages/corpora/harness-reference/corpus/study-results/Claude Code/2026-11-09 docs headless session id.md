---
kind: docs
reportedIn:
  - "[Claude Code docs run programmatically](../../documents/code.claude.com/Claude%20Code%20docs%20run%20programmatically.md)"
version: 2.1.319
version_basis: inferred
locator: Continue conversations
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
observed: 2026-11-09
excerpt:
  exact: session_id=$(claude -p "Start a review" --output-format json | jq -r '.session_id')
  prefix: "on ID to resume a specific one: "
  suffix: ' claude -p "Continue that review'
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T07:53:54Z
---

> session_id=$(claude -p "Start a review" --output-format json | jq -r '.session_id')
