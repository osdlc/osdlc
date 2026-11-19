---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: skill-frontmatter/compatibility
  object:
    supported: false
    basis: undocumented
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose skill frontmatter struct](../../study-results/goose/2026-11-14%20goose%20skill%20frontmatter%20struct.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The skill frontmatter struct reads only name, description and metadata.
reportedIn:
  - "[aaif-goose goose goose-agent skills discovery.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20goose-agent%20skills%20discovery.rs%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[compatibility](../../subjects/skill-frontmatter/compatibility.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

goose parses `name`, `description` and `metadata` from a skill and nothing else, so `compatibility` is not read.
