---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: skill-frontmatter/unknown-keys
  object:
    behavior: ignored without an error
    known_keys:
      - name
      - description
      - metadata
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose skill frontmatter struct](../../study-results/goose/2026-11-14%20goose%20skill%20frontmatter%20struct.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The struct lists three keys and does not refuse others, so the YAML parser drops the rest.
reportedIn:
  - "[aaif-goose goose goose-agent skills discovery.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20goose-agent%20skills%20discovery.rs%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Unknown frontmatter keys](../../subjects/skill-frontmatter/Unknown%20frontmatter%20keys.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Not confirmed by a run.
---

The frontmatter is read into a struct of three keys that does not deny unknown fields, so other keys are dropped. This is read from the source, not from a run.
