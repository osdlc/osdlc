---
kind: source
reportedIn:
  - "[Qwen Code source ui commands.ts at ddeba2f](../../documents/github.com/Qwen%20Code%20source%20ui%20commands.ts%20at%20ddeba2f.md)"
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
version: 0.27.3
version_basis: exact
observed: 2026-11-14
locator: "#L114-L116"
excerpt:
  exact: "const args = commandToExecute ? commandText.slice(argsStart).trim() : parts.slice(pathIndex).join(' ');"
  prefix: " { break; } } else { break; } } "
  suffix: " return { commandToExecute, args"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> const args = commandToExecute ? commandText.slice(argsStart).trim() : parts.slice(pathIndex).join(' ');
