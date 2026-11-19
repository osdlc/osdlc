---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: plugins/install-location
  object:
    discovery_dirs:
      - .grok/plugins (project, needs trust)
      - ~/.grok/plugins (user, auto-trusted)
      - "[plugins].paths"
    claude_equivalents: .claude/plugins also work
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Grok Build Plugin install location](../../study-results/Grok%20Build/2026-11-04%20Grok%20Build%20Plugin%20install%20location.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-04.
reportedIn:
  - "[Grok Build user guide Plugins](../../documents/github.com/Grok%20Build%20user%20guide%20Plugins.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Plugin install location](../../subjects/plugins/Plugin%20install%20location.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Where does grok plugin install put the files of a marketplace plugin, and is a local path copied or used in place?
imported_from: fact:plugins/install-location@grok-build#scope-[null,null,null]
---

Imported from `facts/grok-build/plugins/install-location.md`.

Open questions:
- Where does grok plugin install put the files of a marketplace plugin, and is a local path copied or used in place?
