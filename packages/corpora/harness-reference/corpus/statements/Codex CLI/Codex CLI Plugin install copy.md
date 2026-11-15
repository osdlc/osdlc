---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: plugins/install-copy
  object:
    copied: yes, local plugins are copied into the cache and loaded from the copy
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Codex CLI Plugin install copy](../../study-results/Codex%20CLI/2026-11-04%20Codex%20CLI%20Plugin%20install%20copy.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Codex docs build plugins](../../documents/developers.openai.com/Codex%20docs%20build%20plugins.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Plugin install copy](../../subjects/plugins/Plugin%20install%20copy.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - When Codex copies a plugin into its cache, do exec bits and symlinks survive?
imported_from: fact:plugins/install-copy@codex#scope-[null,null,null]
---

Imported from `facts/codex/plugins/install-copy.md`.

Open questions:
- When Codex copies a plugin into its cache, do exec bits and symlinks survive?
