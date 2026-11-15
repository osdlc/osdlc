---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: plugins/upgrade-retention
  object:
    running_cloud_agent: keeps the versions it started with
    new_agent: picks up the update
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Cursor Old plugin versions](../../study-results/Cursor/2026-11-04%20Cursor%20Old%20plugin%20versions.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Cursor docs Plugins](../../documents/cursor.com/Cursor%20docs%20Plugins.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Old plugin versions](../../subjects/plugins/Old%20plugin%20versions.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - After a local or IDE plugin upgrade, do old plugin versions stay on disk?
imported_from: fact:plugins/upgrade-retention@cursor#scope-[null,null,null]
---

Imported from `facts/cursor/plugins/upgrade-retention.md`.

Open questions:
- After a local or IDE plugin upgrade, do old plugin versions stay on disk?
