---
proposition:
  subject: "[Antigravity](../../harnesses/Antigravity.md)"
  predicate: plugins/upgrade-retention
  object:
    old_version_kept: false
    mechanism: the read-only plugin directory is replaced on update
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Antigravity Old plugin versions](../../study-results/Antigravity/2026-11-04%20Antigravity%20Old%20plugin%20versions.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Antigravity docs Build plugins](../../documents/antigravity.google/Antigravity%20docs%20Build%20plugins.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[Antigravity](../../harnesses/Antigravity.md)"
subject: "[Old plugin versions](../../subjects/plugins/Old%20plugin%20versions.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Does anything else retain the prior version on disk?
imported_from: fact:plugins/upgrade-retention@antigravity#scope-[null,null,null]
---

Imported from `facts/antigravity/plugins/upgrade-retention.md`.

Open questions:
- Does anything else retain the prior version on disk?
