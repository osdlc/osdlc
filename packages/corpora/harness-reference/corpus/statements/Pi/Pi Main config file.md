---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: config/main-file
  object:
    file: .pi/settings.json
    format: JSON
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-08-08 Pi Main config file](../../study-results/Pi/2026-08-08%20Pi%20Main%20config%20file.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: weak
    description: third-party observed 2026-08-08.
  - hasEvidenceItems:
      - "[2026-11-09 Pi packages settings files](../../study-results/Pi/2026-11-09%20Pi%20packages%20settings%20files.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Settings files.
reportedIn:
  - "[Harness comparison](../../documents/skillwright/Harness%20comparison.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-08-08T00:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T12:00:00Z
harness: "[Pi](../../harnesses/Pi.md)"
subject: "[Main config file](../../subjects/config/Main%20config%20file.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:config/main-file@pi#scope-[null,null,null]
---

Imported from `facts/pi/config/main-file.md`.

Rechecked 2026-11-09 against the installed pi 1.5.0 and the v1.5.0 source tree.
