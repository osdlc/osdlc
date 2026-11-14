---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: skill-frontmatter/metadata
  object:
    supported: true
    required: false
    type: map of string to any YAML value
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose skill frontmatter struct](../../study-results/goose/2026-11-14%20goose%20skill%20frontmatter%20struct.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: metadata is an optional map from string to any value.
  - hasEvidenceItems:
      - "[2026-11-14 goose skill metadata arguments](../../study-results/goose/2026-11-14%20goose%20skill%20metadata%20arguments.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: goose reads the arguments key from it.
reportedIn:
  - "[aaif-goose goose goose-agent skills discovery.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20goose-agent%20skills%20discovery.rs%20at%202365bc5.md)"
  - "[aaif-goose goose goose-agent skills mod.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20goose-agent%20skills%20mod.rs%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[metadata](../../subjects/skill-frontmatter/metadata.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

`metadata` is an optional map. goose keeps it with the skill and reads `arguments` and `argument-hint` from it.
