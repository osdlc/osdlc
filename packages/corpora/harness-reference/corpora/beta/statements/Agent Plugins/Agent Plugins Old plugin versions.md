---
proposition:
  subject: "[Agent Plugins](../../harnesses/Agent%20Plugins.md)"
  predicate: plugins/upgrade-retention
  object:
    version_use: clients may use version for update checks and cache staleness
    plugin_data: must be preserved across updates
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Agent Plugins Old plugin versions](../../study-results/Agent%20Plugins/2026-11-04%20Agent%20Plugins%20Old%20plugin%20versions.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Agent Plugins Specification](../../documents/agent-plugins.org/Agent%20Plugins%20Specification.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[Agent Plugins](../../harnesses/Agent%20Plugins.md)"
subject: "[Old plugin versions](../../subjects/plugins/Old%20plugin%20versions.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Does the spec say whether old plugin versions stay on disk after an upgrade? Update mechanics are client-owned and not described.
imported_from: fact:plugins/upgrade-retention@agent-plugins#scope-[null,null,null]
---

Imported from `facts/agent-plugins/plugins/upgrade-retention.md`.

Open questions:
- Does the spec say whether old plugin versions stay on disk after an upgrade? Update mechanics are client-owned and not described.
