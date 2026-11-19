---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: cli/resume
  object:
    supported: true
    flags: --session <path|id> [prompt]
    latest: -c/--continue
    picker: -r/--resume
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-09-25 Pi Resume a session](../../study-results/Pi/2026-09-25%20Pi%20Resume%20a%20session.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: help-text observed 2026-09-25.
  - hasEvidenceItems:
      - "[2026-11-09 Pi help continue session](../../study-results/Pi/2026-11-09%20Pi%20help%20continue%20session.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: --session, --resume, --continue in --help.
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
subject: "[Resume a session](../../subjects/cli/Resume%20a%20session.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:cli/resume@pi#scope-[null,null,null]
---

Imported from `facts/pi/cli/resume.md`.

Rechecked 2026-11-09 against the installed pi 1.5.0.
