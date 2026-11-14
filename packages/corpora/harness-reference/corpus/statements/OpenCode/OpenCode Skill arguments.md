---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: skills/arguments
  object:
    supported: true
    syntax: "@skill-id anywhere in the prompt"
    mechanism: the prompt text is the user message and the mentioned skill's body is attached to it
    note: the skill tool input is only an id
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode prompt payload skills source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20prompt%20payload%20skills%20source%20v2.3.0.md)"
      - "[2026-11-14 OpenCode skill tool input source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20skill%20tool%20input%20source%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The prompt payload carries the prompt text and the selected skills side by side, and the skill tool takes only an id.
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode skills docs mention v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20skills%20docs%20mention%20v2.3.0.md)"
      - "[2026-11-14 OpenCode skills docs skill tool id v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20skills%20docs%20skill%20tool%20id%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The skills page gives the @skill-id mention and the skill tool input.
reportedIn:
  - "[OpenCode source session prompt.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20session%20prompt.ts%20at%20a6b15d3.md)"
  - "[OpenCode source tool plugin skill.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20tool%20plugin%20skill.ts%20at%20a6b15d3.md)"
  - "[OpenCode docs source skills at a6b15d3](../../documents/github.com/OpenCode%20docs%20source%20skills%20at%20a6b15d3.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Skill arguments](../../subjects/skills/Skill%20arguments.md)"
scope:
  since: 2.3.0
  until: null
  platform: []
  model: null
status: current
supersedes: "[OpenCode Skill arguments open](OpenCode%20Skill%20arguments%20open.md)"
---

Read from source and docs at v2.3.0, not observed in a run, so the strength is lowered to moderate.
