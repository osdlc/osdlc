---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: plugins/manifest
  object:
    file: qwen-extension.json
    files:
      - qwen-extension.json
      - plugin.json
    name: extension
    skills: "`skills` names the skills directory (default `skills`)"
    note: an Agent Plugins v1 package keeps its root plugin.json
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Extension manifest docs](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Extension%20manifest%20docs.md)"
      - "[2026-11-14 Qwen Code Extension skills directory docs](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Extension%20skills%20directory%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs at v0.27.3
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[Plugin manifest](../../subjects/plugins/Plugin%20manifest.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

A native extension is a directory with `qwen-extension.json`. An Agent Plugins v1 package is loaded from its own `plugin.json`.
