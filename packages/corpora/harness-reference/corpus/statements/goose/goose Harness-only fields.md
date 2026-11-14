---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: skill-frontmatter/extensions
  object:
    fields: []
    note: "No top-level additions. goose reads two keys inside metadata: arguments (a list of argument names) and argument-hint."
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose skill frontmatter struct](../../study-results/goose/2026-11-14%20goose%20skill%20frontmatter%20struct.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The struct holds only the spec fields name, description and metadata.
  - hasEvidenceItems:
      - "[2026-11-14 goose skill metadata arguments](../../study-results/goose/2026-11-14%20goose%20skill%20metadata%20arguments.md)"
      - "[2026-11-14 goose skill metadata argument-hint](../../study-results/goose/2026-11-14%20goose%20skill%20metadata%20argument-hint.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The argument names and the argument hint are read from the metadata map.
reportedIn:
  - "[aaif-goose goose goose-agent skills discovery.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20goose-agent%20skills%20discovery.rs%20at%202365bc5.md)"
  - "[aaif-goose goose goose-agent skills mod.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20goose-agent%20skills%20mod.rs%20at%202365bc5.md)"
  - "[aaif-goose goose skills mod.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20skills%20mod.rs%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Harness-only fields](../../subjects/skill-frontmatter/Harness-only%20fields.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

goose adds no top-level frontmatter field. Its own keys, `arguments` and `argument-hint`, sit inside `metadata`.
