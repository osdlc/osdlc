---
kind: docs
reportedIn:
  - "[Qwen Code docs source rules.md at ddeba2f](../../documents/github.com/Qwen%20Code%20docs%20source%20rules.md%20at%20ddeba2f.md)"
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
version: 0.27.3
version_basis: exact
observed: 2026-11-14
locator: Baseline and conditional rules
excerpt:
  exact: It stays out of the prompt until a tool call reads or edits a file matching one of its globs, and is then injected once for the rest of the session.
  prefix: "ths:`** — a _conditional_ rule. "
  suffix: " - **Without `paths:`** — a _bas"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> It stays out of the prompt until a tool call reads or edits a file matching one of its globs, and is then injected once for the rest of the session.
