---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: skills/name-validation
  object:
    checks: none; the lowercase kebab-case pattern, the 1 to 64 length and a name that matches the directory are recommendations
    blocking: false
    must_match_directory: false
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode skills docs id rules not enforced v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20skills%20docs%20id%20rules%20not%20enforced%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The skills page says V2 does not enforce the pattern, the length or the name and directory match.
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode skill-file frontmatter schema source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20skill-file%20frontmatter%20schema%20source%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The parser decodes name as a plain optional string with no check. A listing that lacks an option is evidence of absence, one step below its kind.
reportedIn:
  - "[OpenCode docs source skills at a6b15d3](../../documents/github.com/OpenCode%20docs%20source%20skills%20at%20a6b15d3.md)"
  - "[OpenCode source config plugin skill-file.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20config%20plugin%20skill-file.ts%20at%20a6b15d3.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Skill name validation](../../subjects/skills/Skill%20name%20validation.md)"
scope:
  since: 2.3.0
  until: null
  platform: []
  model: null
status: current
---

From the skills docs page and source at v2.3.0.
