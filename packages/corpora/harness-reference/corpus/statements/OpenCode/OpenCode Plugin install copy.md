---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: plugins/install-copy
  object:
    local_plugins: used in place, not copied
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 OpenCode Plugin install copy](../../study-results/OpenCode/2026-11-04%20OpenCode%20Plugin%20install%20copy.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[OpenCode docs Plugins](../../documents/opencode.ai/OpenCode%20docs%20Plugins.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Plugin install copy](../../subjects/plugins/Plugin%20install%20copy.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - For npm plugins, do exec bits and symlinks survive the Bun install?
imported_from: fact:plugins/install-copy@opencode#scope-[null,null,null]
---

Imported from `facts/opencode/plugins/install-copy.md`.

Open questions:
- For npm plugins, do exec bits and symlinks survive the Bun install?
