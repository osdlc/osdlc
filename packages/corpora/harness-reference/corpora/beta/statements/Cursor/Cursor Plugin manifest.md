---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: plugins/manifest
  object:
    files:
      - .cursor-plugin/plugin.json
      - plugin.json (Agent Plugins root)
    components: default directories, or custom paths in the manifest
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-10-01 Cursor Plugin manifest](../../study-results/Cursor/2026-10-01%20Cursor%20Plugin%20manifest.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-10-01.
  - hasEvidenceItems:
      - "[2026-11-09 Cursor docs plugin manifests](../../study-results/Cursor/2026-11-09%20Cursor%20docs%20plugin%20manifests.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Cursor Plugins use .cursor-plugin/plugin.json.
reportedIn:
  - "[Cursor docs Plugins](../../documents/cursor.com/Cursor%20docs%20Plugins.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-01T00:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T12:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Plugin manifest](../../subjects/plugins/Plugin%20manifest.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Whether custom component paths in the manifest replace or add to the default directories.
imported_from: fact:plugins/manifest@cursor#scope-[null,null,null]
---

Imported from `facts/cursor/plugins/manifest.md`.

Open questions:
- Whether custom component paths in the manifest replace or add to the default directories.

Rechecked 2026-11-09 against the installed CLI and vendor docs.
