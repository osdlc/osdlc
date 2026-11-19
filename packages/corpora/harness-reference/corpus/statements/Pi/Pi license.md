---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: skill-frontmatter/license
  object:
    supported: false
    required: false
    note: listed in the docs as a spec field; the skill loader does not read or validate it
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Pi skill frontmatter interface](../../study-results/Pi/2026-11-14%20Pi%20skill%20frontmatter%20interface.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The loader's frontmatter type names only name, description and disable-model-invocation; license falls under the open index signature and no code reads it. A listing that leaves a field out, so one step below source.
  - hasEvidenceItems:
      - "[2026-11-14 Pi docs skill field table](../../study-results/Pi/2026-11-14%20Pi%20docs%20skill%20field%20table.md)"
    directionOfEvidenceProvided: neutral
    description: The skills page lists the field as one the Agent Skills specification defines. It does not say Pi acts on it.
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
subject: "[license](../../subjects/skill-frontmatter/license.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Pi parses the whole frontmatter but its loader uses only `name`, `description` and `disable-model-invocation`. A search of `packages/coding-agent/src` at v1.5.2 finds no other read of `license`. The skill still loads with the field present.
