---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: skills/name-source
  object:
    rule: frontmatter `name`, normalized to a slug; else the directory name (the file stem for a commands/*.md file)
    required_fields: []
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok skill name fallback](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20name%20fallback.md)"
      - "[2026-11-14 grok skill name fallback 2](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20name%20fallback%202.md)"
      - "[2026-11-14 grok skill no frontmatter](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20no%20frontmatter.md)"
      - "[2026-11-14 grok skill description fallback](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20description%20fallback.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The parser prefers the frontmatter name and falls back to the directory name or file stem.
  - hasEvidenceItems:
      - "[2026-11-14 grok skill name field](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20name%20field.md)"
      - "[2026-11-14 grok skill description field](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20description%20field.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The skills guide.
reportedIn:
  - "[xai-org grok-build skills discovery.rs](../../documents/github.com/xai-org%20grok-build%20skills%20discovery.rs.md)"
  - "[Grok Build user guide Skills](../../documents/github.com/Grok%20Build%20user%20guide%20Skills.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Skill name source](../../subjects/skills/Skill%20name%20source.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

No field is required: both name and description have a fallback.
