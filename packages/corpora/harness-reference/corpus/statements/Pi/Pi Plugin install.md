---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: plugins/install
  object:
    commands:
      - pi install ./dir
      - pi install git:github.com/o/r@ref
      - pi install npm:@scope/pkg
    sources: npm or git packages
    recorded_in: packages in ~/.pi/agent/settings.json, or .pi/settings.json with -l
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-08-08 Pi Plugin install](../../study-results/Pi/2026-08-08%20Pi%20Plugin%20install.md)"
    directionOfEvidenceProvided: disputes
    strengthOfEvidenceProvided: weak
    description: third-party observed 2026-08-08; its value differs from the latest.
  - hasEvidenceItems:
      - "[2026-10-01 Pi Plugin install](../../study-results/Pi/2026-10-01%20Pi%20Plugin%20install.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: run observed 2026-10-01.
reportedIn:
  - "[Harness comparison](../../documents/skillwright/Harness%20comparison.md)"
  - "[Pi README](../../documents/Earendil%20Inc/Pi%20README.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-01T00:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T12:00:00Z
harness: "[Pi](../../harnesses/Pi.md)"
subject: "[Plugin install](../../subjects/plugins/Plugin%20install.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: superseded
open:
  - What is the shape of a `packages` entry for a local install (a string, or an object with `source`), and is a relative entry read against the settings file's folder or the folder `pi install` ran in?
imported_from: fact:plugins/install@pi#scope-[null,null,null]
---

Imported from `facts/pi/plugins/install.md`.

The observations disagree on: commands. The latest value is kept.

Open questions:
- What is the shape of a `packages` entry for a local install (a string, or an object with `source`), and is a relative entry read against the settings file's folder or the folder `pi install` ran in?

Superseded 2026-11-09 by a statement with a source-cited value. The earlier object is unchanged.
