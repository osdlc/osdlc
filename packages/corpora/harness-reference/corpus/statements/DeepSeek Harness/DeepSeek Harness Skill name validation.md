---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: skills/name-validation
  object:
    checks: "kebab-case, `^[a-z0-9]+(?:-[a-z0-9]+)*$`"
    charset: "ASCII lowercase letters, digits and hyphens"
    edges: no leading or trailing hyphen
    consecutive_hyphens: false
    colon_allowed: false
    blocking: true
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 dsh skill name pattern](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20skill%20name%20pattern.md)"
      - "[2026-11-14 dsh skill parse invalid name](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20skill%20parse%20invalid%20name.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "The name must match the pattern; a file whose name fails is ignored with a warning."
  - hasEvidenceItems:
      - "[2026-11-14 dsh skill identity doc](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20skill%20identity%20doc.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "The skills doc gives the same pattern."
reportedIn:
  - "[deepseek-ai deepseek-harness skill index.ts at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20skill%20index.ts%20at%2039163dd.md)"
  - "[deepseek-ai deepseek-harness skill-filesystem index.ts at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20skill-filesystem%20index.ts%20at%2039163dd.md)"
  - "[deepseek-ai deepseek-harness skills subsystem doc at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20skills%20subsystem%20doc%20at%2039163dd.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[Skill name validation](../../subjects/skills/Skill%20name%20validation.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
