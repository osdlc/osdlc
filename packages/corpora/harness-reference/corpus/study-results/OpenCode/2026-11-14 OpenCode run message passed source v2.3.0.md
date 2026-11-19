---
kind: source
reportedIn:
  - "[OpenCode source run run.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20run%20run.ts%20at%20a6b15d3.md)"
harness: "[OpenCode](../../harnesses/OpenCode.md)"
version: 2.3.0
version_basis: exact
observed: 2026-11-14
locator: "#L128-L132"
excerpt:
  exact: 'message: [prepared.message, ...prepared.files.flatMap((file) => ("text" in file ? [file.text] : []))].join("\n\n"),'
  prefix: ".id, location: target.location, "
  suffix: " files: prepared.files.flatMap(("
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> message: [prepared.message, ...prepared.files.flatMap((file) => ("text" in file ? [file.text] : []))].join("\n\n"),
