---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: plugins/manifest-validation
  object:
    unknown_fields: ignored
    invalid_fields: a package.json that is not a JSON object counts as missing, and the directory falls back to root file names; a name that is not a string does the same; a GUI entry that is not .js or .cjs is not loaded
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-05 OpenCode Plugin manifest validation](../../study-results/OpenCode/2026-11-05%20OpenCode%20Plugin%20manifest%20validation.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-05.
reportedIn:
  - "[anomalyco opencode plugin host.ts at 32ece82](../../documents/github.com/anomalyco%20opencode%20plugin%20host.ts%20at%2032ece82.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Plugin manifest validation](../../subjects/plugins/Plugin%20manifest%20validation.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Does OpenCode ship a validator or published JSON Schema for a plugin package? opencode plugin check looks for updates; no validate command or plugin schema was found.
imported_from: fact:plugins/manifest-validation@opencode#scope-[null,null,null]
---

Imported from `facts/opencode/plugins/manifest-validation.md`.

Open questions:
- Does OpenCode ship a validator or published JSON Schema for a plugin package? opencode plugin check looks for updates; no validate command or plugin schema was found.
