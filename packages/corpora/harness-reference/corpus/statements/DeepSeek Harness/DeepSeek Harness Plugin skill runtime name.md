---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: skills/plugin-namespace
  object:
    runtime_name: review
    namespace: "none; a skill provider returns the name as is, and the registry accepts only kebab-case names"
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 dsh skill name pattern](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20skill%20name%20pattern.md)"
      - "[2026-11-14 dsh provider candidate name check](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20provider%20candidate%20name%20check.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "The skill registry checks each provider candidate name against the kebab-case pattern, which has no place for a prefix."
reportedIn:
  - "[deepseek-ai deepseek-harness skill index.ts at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20skill%20index.ts%20at%2039163dd.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[Plugin skill runtime name](../../subjects/skills/Plugin%20skill%20runtime%20name.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
