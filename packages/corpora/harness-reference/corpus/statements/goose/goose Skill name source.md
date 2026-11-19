---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: skills/name-source
  object:
    rule: frontmatter `name` only; a SKILL.md without it is skipped
    required_fields:
      - name
    note: On plugin install a missing name falls back to the directory name, and the namespaced name is written into SKILL.md.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose skill missing name skipped](../../study-results/goose/2026-11-14%20goose%20skill%20missing%20name%20skipped.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The runtime name is the frontmatter name, and a skill without one is skipped.
  - hasEvidenceItems:
      - "[2026-11-14 goose open plugins skill name fallback](../../study-results/goose/2026-11-14%20goose%20open%20plugins%20skill%20name%20fallback.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The plugin install code falls back to the directory name.
reportedIn:
  - "[aaif-goose goose goose-agent skills discovery.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20goose-agent%20skills%20discovery.rs%20at%202365bc5.md)"
  - "[aaif-goose goose open_plugins.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20open_plugins.rs%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Skill name source](../../subjects/skills/Skill%20name%20source.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The runtime name of a skill is its frontmatter `name`. The directory name is not used, except by the plugin installer.
