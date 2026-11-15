---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: cli/headless
  object:
    flag: -p/--print
    note: text output by default
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-09-25 Pi Headless run](../../study-results/Pi/2026-09-25%20Pi%20Headless%20run.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: help-text observed 2026-09-25.
  - hasEvidenceItems:
      - "[2026-11-09 Pi help print mode](../../study-results/Pi/2026-11-09%20Pi%20help%20print%20mode.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: -p and --mode in --help.
reportedIn:
  - "[pi harness notes for a dispatcher](../../documents/skillwright/pi%20harness%20notes%20for%20a%20dispatcher.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-09-25T00:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T12:00:00Z
harness: "[Pi](../../harnesses/Pi.md)"
subject: "[Headless run](../../subjects/cli/Headless%20run.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:cli/headless@pi#scope-[null,null,null]
---

Imported from `facts/pi/cli/headless.md`.

Rechecked 2026-11-09 against the installed pi 1.5.0.
