---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: skill-frontmatter/disable-model-invocation
  object:
    supported: true
    effect: only the user's slash command runs the skill; the model cannot invoke it on its own. Defaults to false.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok skill invocation defaults](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20invocation%20defaults.md)"
      - "[2026-11-14 grok skill boolean parse](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20boolean%20parse.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The parser reads the field, with false as the default.
  - hasEvidenceItems:
      - "[2026-11-14 grok skill disable-model-invocation field](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20disable-model-invocation%20field.md)"
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
subject: "[disable-model-invocation](../../subjects/skill-frontmatter/disable-model-invocation.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
