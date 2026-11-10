---
kind: docs
reportedIn:
  - "[Pi docs Skills at v1.5.0](../../documents/github.com/Pi%20docs%20Skills%20at%20v1.5.0.md)"
harness: "[Pi](../../harnesses/Pi.md)"
version: 1.5.0
version_basis: exact
observed: 2026-11-09
locator: Understand how skills load
excerpt:
  exact: At startup, Pi scans configured skill locations and adds each skill’s name, description, and path to the system prompt. It does not add the full instructions. When a task matches, the model reads `SKILL.md` and follows its instructions.
  prefix: ". ## Understand how skills load "
  suffix: " This keeps detailed guidance ou"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
---

> At startup, Pi scans configured skill locations and adds each skill’s name, description, and path to the system prompt. It does not add the full instructions. When a task matches, the model reads `SKILL.md` and follows its instructions.
