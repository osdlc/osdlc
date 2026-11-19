---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: skill-frontmatter/allowed-tools
  object:
    required: false
    form: a YAML list, or a comma- or space-separated string
    note: The field is parsed. The docs describe it as the tools the skill uses; no source read says it pre-approves them, so `supported` is left out.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok skill allowed-tools parse](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20allowed-tools%20parse.md)"
      - "[2026-11-14 grok skill frontmatter keys](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20frontmatter%20keys.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The parser coerces the field from a string or a list.
  - hasEvidenceItems:
      - "[2026-11-14 grok skill allowed-tools field](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20allowed-tools%20field.md)"
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
subject: "[allowed-tools](../../subjects/skill-frontmatter/allowed-tools.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
