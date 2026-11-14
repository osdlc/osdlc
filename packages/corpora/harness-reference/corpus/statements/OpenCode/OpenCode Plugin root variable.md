---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: skills/plugin-root-variable
  object:
    variables: []
    note: a skill body reaches the model unchanged; the loaded skill states its base directory and says relative paths resolve from it
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode skill-file body unchanged source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20skill-file%20body%20unchanged%20source%20v2.3.0.md)"
      - "[2026-11-14 OpenCode skill model output source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20skill%20model%20output%20source%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The parser keeps the Markdown body as written and the model output inserts it trimmed, followed by the base directory line; no variable is replaced on the way. A listing that lacks an option is evidence of absence, one step below its kind.
reportedIn:
  - "[OpenCode source config plugin skill-file.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20config%20plugin%20skill-file.ts%20at%20a6b15d3.md)"
  - "[OpenCode source core skill.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20core%20skill.ts%20at%20a6b15d3.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Plugin root variable](../../subjects/skills/Plugin%20root%20variable.md)"
scope:
  since: 2.3.0
  until: null
  platform: []
  model: null
status: current
---

Read from source at v2.3.0. Plugins are code packages and register skills in code, so there is no plugin folder variable for a skill body.
