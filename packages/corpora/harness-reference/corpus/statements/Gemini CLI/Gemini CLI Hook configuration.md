---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: hooks/config
  object:
    location: settings `hooks`
    kind: shell commands in JSON config
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-08-08 Gemini CLI Hook configuration](../../study-results/Gemini%20CLI/2026-08-08%20Gemini%20CLI%20Hook%20configuration.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: weak
    description: third-party observed 2026-08-08.
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI hooks configured in settings docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20hooks%20configured%20in%20settings%20docs.md)"
      - "[2026-11-14 Gemini CLI hooks settings key example docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20hooks%20settings%20key%20example%20docs.md)"
      - "[2026-11-14 Gemini CLI hook type and command fields docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20hook%20type%20and%20command%20fields%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The hooks docs at v0.68.0 say hooks are configured in settings.json under `hooks`, and that the only hook type is a shell command.
reportedIn:
  - "[Harness comparison](../../documents/skillwright/Harness%20comparison.md)"
  - "[google-gemini gemini-cli docs hooks index.md at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20docs%20hooks%20index.md%20at%205a5c718.md)"
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
    date: 2026-11-14T18:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Hook configuration](../../subjects/hooks/Hook%20configuration.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:hooks/config@gemini-cli#scope-[null,null,null]
---

Imported from `facts/gemini-cli/hooks/config.md`.

Checked against the hooks docs at v0.68.0 on 2026-11-14: the value holds.
