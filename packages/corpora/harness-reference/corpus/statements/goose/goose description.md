---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: skill-frontmatter/description
  object:
    supported: true
    required: false
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose skill frontmatter struct](../../study-results/goose/2026-11-14%20goose%20skill%20frontmatter%20struct.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: description defaults to an empty string when it is missing, and only a missing name skips the skill.
  - hasEvidenceItems:
      - "[2026-11-14 goose docs skill frontmatter required](../../study-results/goose/2026-11-14%20goose%20docs%20skill%20frontmatter%20required.md)"
    directionOfEvidenceProvided: disputes
    strengthOfEvidenceProvided: moderate
    description: The skills guide says SKILL.md requires name and description.
reportedIn:
  - "[aaif-goose goose goose-agent skills discovery.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20goose-agent%20skills%20discovery.rs%20at%202365bc5.md)"
  - "[aaif-goose goose using-skills.md at 2365bc5](../../documents/github.com/aaif-goose%20goose%20using-skills.md%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[description](../../subjects/skill-frontmatter/description.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The loader accepts a skill with no `description`: the field defaults to an empty string. The docs call it required. The source value is kept, at moderate. No length limit is checked.
