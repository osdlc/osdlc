---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: skill-frontmatter/name
  object:
    supported: true
    required: true
    note: A SKILL.md with no name, or an empty one, is skipped with a warning. The loader checks no length; the 64-character limit applies only to skills created through goose.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose skill missing name skipped](../../study-results/goose/2026-11-14%20goose%20skill%20missing%20name%20skipped.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: A skill with a missing or empty name is skipped.
  - hasEvidenceItems:
      - "[2026-11-14 goose skill create name rule](../../study-results/goose/2026-11-14%20goose%20skill%20create%20name%20rule.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: validate_skill_name, used when goose creates a skill, limits the name to 64 characters.
  - hasEvidenceItems:
      - "[2026-11-14 goose docs skill frontmatter required](../../study-results/goose/2026-11-14%20goose%20docs%20skill%20frontmatter%20required.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The skills guide says SKILL.md requires name and description.
reportedIn:
  - "[aaif-goose goose goose-agent skills discovery.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20goose-agent%20skills%20discovery.rs%20at%202365bc5.md)"
  - "[aaif-goose goose skills mod.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20skills%20mod.rs%20at%202365bc5.md)"
  - "[aaif-goose goose using-skills.md at 2365bc5](../../documents/github.com/aaif-goose%20goose%20using-skills.md%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[name](../../subjects/skill-frontmatter/name.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

`name` is required: a skill without it is not loaded.
