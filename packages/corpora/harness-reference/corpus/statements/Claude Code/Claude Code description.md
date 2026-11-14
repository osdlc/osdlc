---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: skill-frontmatter/description
  object:
    supported: true
    required: false
    fallback: the first non-empty line of the markdown content
    listing_cap: "`description` plus `when_to_use` is truncated at 1,536 characters in the skill listing; set by `skillListingMaxDescChars`"
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 docs skills fm all optional](../../study-results/Claude%20Code/2026-11-14%20docs%20skills%20fm%20all%20optional.md)"
      - "[2026-11-14 docs skills fm description](../../study-results/Claude%20Code/2026-11-14%20docs%20skills%20fm%20description.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The frontmatter reference marks `description` as recommended, not required, and names the fallback.
  - hasEvidenceItems:
      - "[2026-11-14 docs skills fm description cap](../../study-results/Claude%20Code/2026-11-14%20docs%20skills%20fm%20description%20cap.md)"
      - "[2026-11-14 docs skills fm description cap setting](../../study-results/Claude%20Code/2026-11-14%20docs%20skills%20fm%20description%20cap%20setting.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The docs give the 1,536-character cap on the listing text and the setting that changes it.
reportedIn:
  - "[Claude Code docs skills](../../documents/code.claude.com/Claude%20Code%20docs%20skills.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T08:30:37Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[description](../../subjects/skill-frontmatter/description.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

`description` is recommended, not required. The docs state no limit on the field itself, so
`max_length` is left out: 1,536 characters is where the skill listing cuts the combined
`description` and `when_to_use` text, and a setting changes it.
