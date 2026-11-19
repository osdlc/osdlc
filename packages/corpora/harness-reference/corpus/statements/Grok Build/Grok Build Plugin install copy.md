---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: plugins/install-copy
  object:
    helper_scripts: copied to the machine with the plugin
    vendored_marketplace_plugins: copied from the marketplace repository checkout
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Grok Build Plugin install copy](../../study-results/Grok%20Build/2026-11-04%20Grok%20Build%20Plugin%20install%20copy.md)"
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
subject: "[Plugin install copy](../../subjects/plugins/Plugin%20install%20copy.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Do exec bits and symlinks inside a plugin survive install?
imported_from: fact:plugins/install-copy@grok-build#scope-[null,null,null]
---

Imported from `facts/grok-build/plugins/install-copy.md`.

Open questions:
- Do exec bits and symlinks inside a plugin survive install?
