---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: skill-frontmatter/extensions
  object:
    fields:
      - disable-model-invocation
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Pi skill frontmatter interface](../../study-results/Pi/2026-11-14%20Pi%20skill%20frontmatter%20interface.md)"
      - "[2026-11-14 Pi skill disable-model-invocation read](../../study-results/Pi/2026-11-14%20Pi%20skill%20disable-model-invocation%20read.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The only key the loader reads besides name and description. That it is outside the specification is our comparison with the specification's field table, so one step lower.
  - hasEvidenceItems:
      - "[2026-11-14 Pi docs skill field table](../../study-results/Pi/2026-11-14%20Pi%20docs%20skill%20field%20table.md)"
    directionOfEvidenceProvided: neutral
    description: The skills page lists it among the fields the Agent Skills specification defines.
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
subject: "[Harness-only fields](../../subjects/skill-frontmatter/Harness-only%20fields.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The Agent Skills specification lists six fields: name, description, license, compatibility, metadata and allowed-tools (see the Agent Skills statements). `disable-model-invocation` is not among them, though Pi's skills page puts it in the same table.
