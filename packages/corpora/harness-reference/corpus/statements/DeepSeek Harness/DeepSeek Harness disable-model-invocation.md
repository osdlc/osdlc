---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: skill-frontmatter/disable-model-invocation
  object:
    supported: true
    effect: "the skill is left out of the model catalog and the skill tool refuses it; the user can still invoke it with `/name`"
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 dsh skill invocation keys](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20skill%20invocation%20keys.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "The local provider reads disable-model-invocation and sets modelInvocable from it."
  - hasEvidenceItems:
      - "[2026-11-14 dsh catalog filters model-invocable](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20catalog%20filters%20model-invocable.md)"
      - "[2026-11-14 dsh skill tool refuses non-model-invocable](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20skill%20tool%20refuses%20non-model-invocable.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "tool-skill filters the catalog by isModelInvocable and the skill tool throws SKILL_NOT_MODEL_INVOCABLE."
  - hasEvidenceItems:
      - "[2026-11-14 dsh invocation keys doc](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20invocation%20keys%20doc.md)"
      - "[2026-11-14 dsh disable-model-invocation entry point](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20disable-model-invocation%20entry%20point.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "The skills doc and the tool-skill README say the same."
reportedIn:
  - "[deepseek-ai deepseek-harness skill-filesystem index.ts at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20skill-filesystem%20index.ts%20at%2039163dd.md)"
  - "[deepseek-ai deepseek-harness tool-skill index.ts at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20tool-skill%20index.ts%20at%2039163dd.md)"
  - "[deepseek-ai deepseek-harness skills subsystem doc at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20skills%20subsystem%20doc%20at%2039163dd.md)"
  - "[deepseek-ai deepseek-harness tool-skill README at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20tool-skill%20README%20at%2039163dd.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[disable-model-invocation](../../subjects/skill-frontmatter/disable-model-invocation.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
