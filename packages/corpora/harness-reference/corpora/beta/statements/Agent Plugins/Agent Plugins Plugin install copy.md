---
proposition:
  subject: "[Agent Plugins](../../harnesses/Agent%20Plugins.md)"
  predicate: plugins/install-copy
  object:
    symlinks: may resolve to targets inside the plugin root; package paths resolving outside must be rejected
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Agent Plugins Plugin install copy](../../study-results/Agent%20Plugins/2026-11-04%20Agent%20Plugins%20Plugin%20install%20copy.md)"
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
subject: "[Plugin install copy](../../subjects/plugins/Plugin%20install%20copy.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Does the spec say whether a client copies the plugin folder on install, and whether exec bits survive? The fetched text says neither.
imported_from: fact:plugins/install-copy@agent-plugins#scope-[null,null,null]
---

Imported from `facts/agent-plugins/plugins/install-copy.md`.

Open questions:
- Does the spec say whether a client copies the plugin folder on install, and whether exec bits survive? The fetched text says neither.
