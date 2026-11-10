---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: plugins/install-location
  object:
    npm_plugins: installed with Bun at startup; cached in ~/.cache/opencode/node_modules
    local_plugins: loaded directly from the plugin directory
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 OpenCode Plugin install location](../../study-results/OpenCode/2026-11-04%20OpenCode%20Plugin%20install%20location.md)"
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
subject: "[Plugin install location](../../subjects/plugins/Plugin%20install%20location.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Does OpenCode have a plugin or package format that installs skills? The plugins page describes JavaScript or TypeScript plugin modules and never mentions skills.
imported_from: fact:plugins/install-location@opencode#scope-[null,null,null]
---

Imported from `facts/opencode/plugins/install-location.md`.

Open questions:
- Does OpenCode have a plugin or package format that installs skills? The plugins page describes JavaScript or TypeScript plugin modules and never mentions skills.
