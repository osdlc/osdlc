---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: plugins/manifest-validation
  object:
    unknown_fields: ignored
    invalid_fields: a pi resource key that is not an array of strings, or a changelogPath that is not a string, is ignored silently; unreadable or malformed JSON, or a pi value that is not an object, makes readPiManifest return no manifest; for extensions pi then falls back to index.ts or index.js
    dependency_warning: host-provided pi packages listed in dependencies draw an extension warning
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-05 Pi Plugin manifest validation](../../study-results/Pi/2026-11-05%20Pi%20Plugin%20manifest%20validation.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-05.
reportedIn:
  - "[earendil-works pi core source at 2a32a60](../../documents/github.com/earendil-works%20pi%20core%20source%20at%202a32a60.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
harness: "[Pi](../../harnesses/Pi.md)"
subject: "[Plugin manifest validation](../../subjects/plugins/Plugin%20manifest%20validation.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Does pi ship a command or published JSON Schema that validates the pi block in package.json? None was found in the source or the packages docs.
imported_from: fact:plugins/manifest-validation@pi#scope-[null,null,null]
---

Imported from `facts/pi/plugins/manifest-validation.md`.

Open questions:
- Does pi ship a command or published JSON Schema that validates the pi block in package.json? None was found in the source or the packages docs.
