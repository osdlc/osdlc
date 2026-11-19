---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: skills/prequalified-name
  object:
    behaviour: "rejected: a name with a colon fails the kebab-case check; a skill file is ignored with a warning, and a provider candidate throws SKILL_INVALID_DEFINITION"
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 dsh skill name pattern](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20skill%20name%20pattern.md)"
      - "[2026-11-14 dsh skill parse invalid name](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20skill%20parse%20invalid%20name.md)"
      - "[2026-11-14 dsh provider candidate name check](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20provider%20candidate%20name%20check.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "The name pattern allows no colon; the local provider ignores a file with an invalid name and the registry throws on an invalid candidate."
reportedIn:
  - "[deepseek-ai deepseek-harness skill index.ts at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20skill%20index.ts%20at%2039163dd.md)"
  - "[deepseek-ai deepseek-harness skill-filesystem index.ts at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20skill-filesystem%20index.ts%20at%2039163dd.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[Pre-qualified skill name](../../subjects/skills/Pre-qualified%20skill%20name.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
