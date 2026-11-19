---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: skills/name-validation
  object:
    checks: "after normalizing: 1 to 64 characters, lowercase letters, digits and hyphens, no leading, trailing or double hyphen"
    charset: a-z, 0-9 and hyphen
    length: 1-64
    colon_allowed: false
    consecutive_hyphens: false
    edges: no leading or trailing hyphen
    must_match_directory: false
    rejects_only: a skill whose frontmatter name and directory name both fail after normalizing
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok skill name normalize](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20name%20normalize.md)"
      - "[2026-11-14 grok skill name normalize 2](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20name%20normalize%202.md)"
      - "[2026-11-14 grok skill name valid](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20name%20valid.md)"
      - "[2026-11-14 grok skill length limits](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20length%20limits.md)"
      - "[2026-11-14 grok skill name fallback](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20name%20fallback.md)"
      - "[2026-11-14 grok skill invalid name dropped](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20invalid%20name%20dropped.md)"
      - "[2026-11-14 grok skill name mismatch warning](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20name%20mismatch%20warning.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The normalizer, the validity check, the fallback, the drop with a warning and the mismatch warning.
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
subject: "[Skill name validation](../../subjects/skills/Skill%20name%20validation.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The name is normalized first (lowercased, other characters turned into hyphens, hyphens collapsed and trimmed), so most names pass. A name that differs from the directory name only logs a warning.
