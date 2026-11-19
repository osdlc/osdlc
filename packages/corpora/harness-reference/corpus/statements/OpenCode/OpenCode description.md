---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: skill-frontmatter/description
  object:
    supported: true
    required: false
    note: no maximum length is enforced; a skill without one is not advertised to the model
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode skill-file frontmatter schema source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20skill-file%20frontmatter%20schema%20source%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The parser decodes description as an optional string with no length check.
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode skills docs description field v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20skills%20docs%20description%20field%20v2.3.0.md)"
      - "[2026-11-14 OpenCode skills docs frontmatter optional v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20skills%20docs%20frontmatter%20optional%20v2.3.0.md)"
      - "[2026-11-14 OpenCode skills docs id rules not enforced v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20skills%20docs%20id%20rules%20not%20enforced%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The skills page says all frontmatter is optional, a skill without a description is not advertised, and no maximum length is enforced.
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
subject: "[description](../../subjects/skill-frontmatter/description.md)"
scope:
  since: 2.3.0
  until: null
  platform: []
  model: null
status: current
---

From source and the skills docs page at v2.3.0.
