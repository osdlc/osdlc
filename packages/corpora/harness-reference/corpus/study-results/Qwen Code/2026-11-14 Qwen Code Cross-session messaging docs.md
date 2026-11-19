---
kind: docs
reportedIn:
  - "[Qwen Code docs source commands.md at ddeba2f](../../documents/github.com/Qwen%20Code%20docs%20source%20commands.md%20at%20ddeba2f.md)"
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
version: 0.27.3
version_basis: exact
observed: 2026-11-14
locator: qwen sessions ps
excerpt:
  exact: With messaging active, the model in one session can discover the others with `list_agents` — each appears under `sessions` with the `name` that `qwen sessions ps --json` records (the table view may truncate long names) — and address one with `send_message` using that name as `to`.
  prefix: "e does not make it messageable. "
  suffix: " When two sessions share a name,"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> With messaging active, the model in one session can discover the others with `list_agents` — each appears under `sessions` with the `name` that `qwen sessions ps --json` records (the table view may truncate long names) — and address one with `send_message` using that name as `to`.
