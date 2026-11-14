---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: skill-frontmatter/disable-model-invocation
  object:
    supported: true
    effect: the skill is left out of the system prompt; the user can still load it with `/skill:name`
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Pi skill disable-model-invocation read](../../study-results/Pi/2026-11-14%20Pi%20skill%20disable-model-invocation%20read.md)"
      - "[2026-11-14 Pi skill hidden from prompt](../../study-results/Pi/2026-11-14%20Pi%20skill%20hidden%20from%20prompt.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The loader reads the key and the prompt builder filters those skills out.
  - hasEvidenceItems:
      - "[2026-11-14 Pi docs disable-model-invocation](../../study-results/Pi/2026-11-14%20Pi%20docs%20disable-model-invocation.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Skills page.
reportedIn:
  - "[Pi source skills.ts at v1.5.2](../../documents/github.com/Pi%20source%20skills.ts%20at%20v1.5.2.md)"
  - "[Pi docs Skills at v1.5.2](../../documents/github.com/Pi%20docs%20Skills%20at%20v1.5.2.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Pi](../../harnesses/Pi.md)"
subject: "[disable-model-invocation](../../subjects/skill-frontmatter/disable-model-invocation.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Only the boolean `true` counts.
