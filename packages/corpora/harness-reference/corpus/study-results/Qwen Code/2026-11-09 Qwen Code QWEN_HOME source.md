---
kind: source
reportedIn:
  - "[Qwen Code source storage.ts at 03b0c24](../../documents/github.com/Qwen%20Code%20source%20storage.ts%20at%2003b0c24.md)"
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
version: 0.27.0
version_basis: exact
observed: 2026-11-09
locator: global Qwen directory
excerpt:
  exact: const envDir = process.env['QWEN_HOME'];
  prefix: "ic getGlobalQwenDir(): string { "
  suffix: " if (envDir) { return Storage.re"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T00:00:00Z
---

> const envDir = process.env['QWEN_HOME'];
