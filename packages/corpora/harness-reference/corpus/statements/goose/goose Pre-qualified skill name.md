---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: skills/prequalified-name
  object:
    behaviour: prefix doubled (`acme-tools:acme-tools:review`)
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose open plugins skill name fallback](../../study-results/goose/2026-11-14%20goose%20open%20plugins%20skill%20name%20fallback.md)"
      - "[2026-11-14 goose open plugins namespaced name](../../study-results/goose/2026-11-14%20goose%20open%20plugins%20namespaced%20name.md)"
      - "[2026-11-14 goose open plugins rewrite skill name](../../study-results/goose/2026-11-14%20goose%20open%20plugins%20rewrite%20skill%20name.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The install code takes the frontmatter name as it is and puts the plugin name and a colon in front, with no check for an existing prefix.
reportedIn:
  - "[aaif-goose goose open_plugins.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20open_plugins.rs%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Pre-qualified skill name](../../subjects/skills/Pre-qualified%20skill%20name.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Not confirmed by installing such a plugin.
---

The install code prefixes whatever the frontmatter `name` holds, so a name that already carries the prefix gets it twice. This is read from the source, not from a run.
