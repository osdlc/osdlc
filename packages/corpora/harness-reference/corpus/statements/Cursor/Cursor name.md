---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: skill-frontmatter/name
  object:
    supported: true
    required: true
    max_length: 64
    note: in the CLI a name over 64 characters raises a warning in `/skills` and the skill still loads
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Cursor docs skill name field](../../study-results/Cursor/2026-11-14%20Cursor%20docs%20skill%20name%20field.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The frontmatter table marks `name` as required.
  - hasEvidenceItems:
      - "[2026-11-14 Cursor changelog skills limits warnings](../../study-results/Cursor/2026-11-14%20Cursor%20changelog%20skills%20limits%20warnings.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The CLI changelog gives the 64-character limit and says such skills load with a warning.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[name](../../subjects/skill-frontmatter/name.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
