---
proposition:
  subject: "[Amp](../../harnesses/Amp.md)"
  predicate: config/main-file
  object:
    file: .amp/settings.json or .amp/settings.jsonc (workspace, nearest searched upward); ~/.config/amp/settings.json or settings.jsonc (user)
    format: JSON or JSONC
    merge: workspace settings override user settings
    note: All settings use the amp. prefix. --settings-file <path> replaces the user file.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 settings locations](../../study-results/Amp/2026-11-09%20settings%20locations.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09.
  - hasEvidenceItems:
      - "[2026-11-09 settings user file](../../study-results/Amp/2026-11-09%20settings%20user%20file.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09.
  - hasEvidenceItems:
      - "[2026-11-09 settings custom file flag](../../study-results/Amp/2026-11-09%20settings%20custom%20file%20flag.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09.
  - hasEvidenceItems:
      - "[2026-11-09 settings workspace overrides](../../study-results/Amp/2026-11-09%20settings%20workspace%20overrides.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09.
  - hasEvidenceItems:
      - "[2026-11-09 settings amp prefix](../../study-results/Amp/2026-11-09%20settings%20amp%20prefix.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09.
reportedIn:
  - "[Amp docs Configuration](../../documents/ampcode.com/Amp%20docs%20Configuration.md)"
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
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T12:00:00Z
harness: "[Amp](../../harnesses/Amp.md)"
subject: "[Main config file](../../subjects/config/Main%20config%20file.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:config/main-file@amp#scope-[null,null,null]
---

Imported from `facts/amp/config/main-file.md`.
