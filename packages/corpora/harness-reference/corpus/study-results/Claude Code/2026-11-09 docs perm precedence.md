---
kind: docs
reportedIn:
  - "[Claude Code docs permissions](../../documents/code.claude.com/Claude%20Code%20docs%20permissions.md)"
version: 2.1.319
version_basis: inferred
locator: Permission rules
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
observed: 2026-11-09
excerpt:
  exact: "Rules are evaluated in order: deny, then ask, then allow. The first match in that order determines the outcome, and rule specificity doesn’t change the order."
  prefix: " from using the specified tool. "
  suffix: " A broad deny rule like Bash(aws"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T07:53:54Z
---

> Rules are evaluated in order: deny, then ask, then allow. The first match in that order determines the outcome, and rule specificity doesn’t change the order.
