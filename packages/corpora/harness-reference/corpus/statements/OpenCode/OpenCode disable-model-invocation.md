---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: skill-frontmatter/disable-model-invocation
  object:
    supported: true
    effect: true omits the skill from the model's available list; it can still be loaded by id; metadata opencode/autoinvoke wins when both are set
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode skill-file autoinvoke source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20skill-file%20autoinvoke%20source%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The parser turns a true disable-model-invocation into autoinvoke false unless metadata opencode/autoinvoke is set.
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode skills docs disable-model-invocation v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20skills%20docs%20disable-model-invocation%20v2.3.0.md)"
      - "[2026-11-14 OpenCode skills docs autoinvoke v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20skills%20docs%20autoinvoke%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The skills page gives the effect and the precedence.
reportedIn:
  - "[OpenCode source config plugin skill-file.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20config%20plugin%20skill-file.ts%20at%20a6b15d3.md)"
  - "[OpenCode docs source skills at a6b15d3](../../documents/github.com/OpenCode%20docs%20source%20skills%20at%20a6b15d3.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[disable-model-invocation](../../subjects/skill-frontmatter/disable-model-invocation.md)"
scope:
  since: 2.3.0
  until: null
  platform: []
  model: null
status: current
---

From source and the skills docs page at v2.3.0.
