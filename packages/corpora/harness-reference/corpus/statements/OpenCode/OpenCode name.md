---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: skill-frontmatter/name
  object:
    supported: true
    required: false
    note: a display name; defaults to the path-derived id; no length limit is enforced
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode skill-file frontmatter schema source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20skill-file%20frontmatter%20schema%20source%20v2.3.0.md)"
      - "[2026-11-14 OpenCode skill-file name fallback source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20skill-file%20name%20fallback%20source%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The parser decodes name as an optional string and falls back to the id.
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode skills docs name field v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20skills%20docs%20name%20field%20v2.3.0.md)"
      - "[2026-11-14 OpenCode skills docs frontmatter optional v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20skills%20docs%20frontmatter%20optional%20v2.3.0.md)"
      - "[2026-11-14 OpenCode skills docs id rules not enforced v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20skills%20docs%20id%20rules%20not%20enforced%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The skills page says name is a display name that defaults to the id, and that the length recommendation is not enforced.
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
subject: "[name](../../subjects/skill-frontmatter/name.md)"
scope:
  since: 2.3.0
  until: null
  platform: []
  model: null
status: current
---

From source and the skills docs page at v2.3.0.
