---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: skills/name-source
  object:
    rule: "the file path: the directory holding SKILL.md, or the file name of a root-level .md file; frontmatter name is only a display label"
    required_fields: []
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode skill-file id from path source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20skill-file%20id%20from%20path%20source%20v2.3.0.md)"
      - "[2026-11-14 OpenCode skill-file name fallback source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20skill-file%20name%20fallback%20source%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The parser derives the id from the path and uses name only as the display name.
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode skills docs id from path v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20skills%20docs%20id%20from%20path%20v2.3.0.md)"
      - "[2026-11-14 OpenCode skills docs frontmatter optional v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20skills%20docs%20frontmatter%20optional%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The skills page says the same, and that all frontmatter is optional.
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
subject: "[Skill name source](../../subjects/skills/Skill%20name%20source.md)"
scope:
  since: 2.3.0
  until: null
  platform: []
  model: null
status: current
---

From source and the skills docs page at v2.3.0.
