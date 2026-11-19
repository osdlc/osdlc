---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: skills/user-invocation
  object:
    syntax: "@review"
    effect: attaches the skill's body to the prompt
    note: a mention of the skill id inside the prompt, not a slash command
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode skills docs mention v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20skills%20docs%20mention%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The skills page says to mention a skill in the prompt as @skill-id.
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode prompt payload skills source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20prompt%20payload%20skills%20source%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The prompt code attaches the text of each selected skill to the user message.
reportedIn:
  - "[OpenCode docs source skills at a6b15d3](../../documents/github.com/OpenCode%20docs%20source%20skills%20at%20a6b15d3.md)"
  - "[OpenCode source session prompt.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20session%20prompt.ts%20at%20a6b15d3.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[User invocation syntax](../../subjects/skills/User%20invocation%20syntax.md)"
scope:
  since: 2.3.0
  until: null
  platform: []
  model: null
status: current
---

From the skills docs page and source at v2.3.0. Lowered to moderate: the syntax itself is from the docs.
