---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: plugins/upgrade-retention
  object:
    open: &a1
      - After a plugin upgrade, does Codex keep the previous version directory under plugins/cache?
direction: neutral
reportedIn:
  - "[Codex docs build plugins](../../documents/developers.openai.com/Codex%20docs%20build%20plugins.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Old plugin versions](../../subjects/plugins/Old%20plugin%20versions.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: open
open: *a1
imported_from: fact:plugins/upgrade-retention@codex#open
---

Imported from `facts/codex/plugins/upgrade-retention.md`.

Open questions:
- After a plugin upgrade, does Codex keep the previous version directory under plugins/cache?
