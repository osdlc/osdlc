---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: skill-frontmatter/name
  object:
    supported: true
    required: false
    max_length: 64
    note: The value is normalized to a lowercase slug. When it is absent or invalid, the directory name is used.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok skill length limits](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20length%20limits.md)"
      - "[2026-11-14 grok skill name normalize](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20name%20normalize.md)"
      - "[2026-11-14 grok skill name normalize 2](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20name%20normalize%202.md)"
      - "[2026-11-14 grok skill name fallback](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20name%20fallback.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The length constant, the normalizer and the directory fallback.
  - hasEvidenceItems:
      - "[2026-11-14 grok skill name field](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20name%20field.md)"
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
subject: "[name](../../subjects/skill-frontmatter/name.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
