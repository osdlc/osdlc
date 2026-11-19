---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: plugins/manifest-validation
  object:
    unknown_fields: ignored
    invalid_fields: a parse error or an invalid name fails the manifest load; discovery skips the plugin with a warning
    validator: grok plugin validate [<path>]
    validator_checks: loads the manifest from the search order and runs the same name check; prints name, version, description and a component summary
    marketplace_unknown_fields: ignored
    marketplace_invalid_fields: a file that exists but does not parse is an error; no fallback to the next candidate
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-05 Grok Build Plugin manifest validation](../../study-results/Grok%20Build/2026-11-05%20Grok%20Build%20Plugin%20manifest%20validation.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-05.
  - hasEvidenceItems:
      - "[2026-11-05 Grok Build Plugin manifest validation 2](../../study-results/Grok%20Build/2026-11-05%20Grok%20Build%20Plugin%20manifest%20validation%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-05.
  - hasEvidenceItems:
      - "[2026-11-05 Grok Build Plugin manifest validation 3](../../study-results/Grok%20Build/2026-11-05%20Grok%20Build%20Plugin%20manifest%20validation%203.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-05.
reportedIn:
  - "[xai-org grok-build plugins manifest.rs](../../documents/github.com/xai-org%20grok-build%20plugins%20manifest.rs.md)"
  - "[xai-org grok-build plugin_cmd.rs](../../documents/github.com/xai-org%20grok-build%20plugin_cmd.rs.md)"
  - "[xai-org grok-build plugin-marketplace index.rs](../../documents/github.com/xai-org%20grok-build%20plugin-marketplace%20index.rs.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Plugin manifest validation](../../subjects/plugins/Plugin%20manifest%20validation.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:plugins/manifest-validation@grok-build#scope-[null,null,null]
---

Imported from `facts/grok-build/plugins/manifest-validation.md`.
