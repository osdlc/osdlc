---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: skill-frontmatter/description
  object:
    supported: true
    required: false
    max_length: 1024
    note: A longer value is cut to 1024 characters. When the field is absent, the first paragraph of the body is used, then the skill name.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok skill length limits](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20length%20limits.md)"
      - "[2026-11-14 grok skill description cap](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20description%20cap.md)"
      - "[2026-11-14 grok skill description fallback](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20description%20fallback.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The length constant, the cap and the fallback.
  - hasEvidenceItems:
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
subject: "[description](../../subjects/skill-frontmatter/description.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
