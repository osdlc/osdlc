---
proposition:
  subject: "[Antigravity](../../harnesses/Antigravity.md)"
  predicate: skill-frontmatter/extensions
  object:
    fields:
      - disable-model-invocation
      - disable-slash-command
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 build-plugins disable-model-invocation](../../study-results/Antigravity/2026-11-14%20build-plugins%20disable-model-invocation.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The Build plugins page documents disable-model-invocation.
  - hasEvidenceItems:
      - "[2026-11-14 changelog disable-slash-command](../../study-results/Antigravity/2026-11-14%20changelog%20disable-slash-command.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The 1.1.12 changelog adds disable-slash-command.
reportedIn:
  - "[Antigravity docs Build plugins antigravity.google](../../documents/antigravity.google/Antigravity%20docs%20Build%20plugins%20antigravity.google.md)"
  - "[Antigravity CLI CHANGELOG at f51cb8d](../../documents/Google/Antigravity%20CLI%20CHANGELOG%20at%20f51cb8d.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Antigravity](../../harnesses/Antigravity.md)"
subject: "[Harness-only fields](../../subjects/skill-frontmatter/Harness-only%20fields.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

`disable-slash-command: true` hides a skill from the `/` menu and from `/name` resolution; the model can still find and invoke it. `disable-model-invocation: true` is the reverse.
