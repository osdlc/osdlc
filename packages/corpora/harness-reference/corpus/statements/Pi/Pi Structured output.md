---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: cli/structured-output
  object:
    output: --mode json
    rpc: --mode rpc, a standing JSON-over-stdio protocol
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-09-25 Pi Structured output](../../study-results/Pi/2026-09-25%20Pi%20Structured%20output.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: help-text observed 2026-09-25.
  - hasEvidenceItems:
      - "[2026-11-09 Pi help print mode](../../study-results/Pi/2026-11-09%20Pi%20help%20print%20mode.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: --mode json and rpc in --help.
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
subject: "[Structured output](../../subjects/cli/Structured%20output.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:cli/structured-output@pi#scope-[null,null,null]
---

Imported from `facts/pi/cli/structured-output.md`.

Rechecked 2026-11-09 against the installed pi 1.5.0.
