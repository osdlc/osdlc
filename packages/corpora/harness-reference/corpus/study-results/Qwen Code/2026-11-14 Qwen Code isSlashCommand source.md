---
kind: source
reportedIn:
  - "[Qwen Code source commandUtils.ts at ddeba2f](../../documents/github.com/Qwen%20Code%20source%20commandUtils.ts%20at%20ddeba2f.md)"
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
version: 0.27.3
version_basis: exact
observed: 2026-11-14
locator: "#L100-L120"
excerpt:
  exact: "export const isSlashCommand = (query: string): boolean => { if (!query.startsWith('/')) { return false; }"
  prefix: "/' command, false otherwise. */ "
  suffix: " // Exclude line comments that s"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> export const isSlashCommand = (query: string): boolean => { if (!query.startsWith('/')) { return false; }
