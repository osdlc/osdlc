---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: plugins/upgrade-retention
  object:
    open: &a1
      - After an npm plugin upgrade, do old versions stay in ~/.cache/opencode/node_modules/?
direction: neutral
reportedIn:
  - "[OpenCode docs Plugins](../../documents/opencode.ai/OpenCode%20docs%20Plugins.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Old plugin versions](../../subjects/plugins/Old%20plugin%20versions.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: open
open: *a1
imported_from: fact:plugins/upgrade-retention@opencode#open
---

Imported from `facts/opencode/plugins/upgrade-retention.md`.

Open questions:
- After an npm plugin upgrade, do old versions stay in ~/.cache/opencode/node_modules/?
