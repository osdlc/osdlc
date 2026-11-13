---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: plugins/install-copy
  object:
    copied_whole: yes for marketplace plugins; files outside the plugin directory are not copied
    symlinks_leaving_plugin: rejected as component paths, except links between plugins within one marketplace
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Claude Code Plugin install copy](../../study-results/Claude%20Code/2026-11-04%20Claude%20Code%20Plugin%20install%20copy.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 Claude Code Plugin install copy 2](../../study-results/Claude%20Code/2026-11-04%20Claude%20Code%20Plugin%20install%20copy%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Claude Code docs plugin loading reference](../../documents/code.claude.com/Claude%20Code%20docs%20plugin%20loading%20reference.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Plugin install copy](../../subjects/plugins/Plugin%20install%20copy.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - When the plugin folder is copied into the cache, do exec bits and symlinks that stay inside the plugin survive the copy?
imported_from: fact:plugins/install-copy@claude-code#scope-[null,null,null]
---

Imported from `facts/claude-code/plugins/install-copy.md`.

Open questions:
- When the plugin folder is copied into the cache, do exec bits and symlinks that stay inside the plugin survive the copy?
