---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: cli/headless
  object:
    flag: -p, --prompt <string>
    note: appended to stdin
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-10-09 Gemini CLI Headless run](../../study-results/Gemini%20CLI/2026-10-09%20Gemini%20CLI%20Headless%20run.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: help-text observed 2026-10-09.
  - hasEvidenceItems:
      - "[2026-11-09 Headless flag help 0.65](../../study-results/Gemini%20CLI/2026-11-09%20Headless%20flag%20help%200.65.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "help-text for 0.65.0 agrees: -p/--prompt, appended to stdin."
reportedIn:
  - "[gemini harness notes for a dispatcher](../../documents/skillwright/gemini%20harness%20notes%20for%20a%20dispatcher.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-09T00:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Headless run](../../subjects/cli/Headless%20run.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:cli/headless@gemini-cli#scope-[null,null,null]
---

Imported from `facts/gemini-cli/cli/headless.md`.
