---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: skill-frontmatter/description
  object:
    supported: true
    required: true
    max_length: 1024
    note: in the CLI a description over 1,024 characters raises a warning in `/skills` and the skill still loads; in Cloud Agents a skill with no description warns and can still be invoked by name
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Cursor docs skill description field](../../study-results/Cursor/2026-11-14%20Cursor%20docs%20skill%20description%20field.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The frontmatter table marks `description` as required.
  - hasEvidenceItems:
      - "[2026-11-14 Cursor changelog skills limits warnings](../../study-results/Cursor/2026-11-14%20Cursor%20changelog%20skills%20limits%20warnings.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The CLI changelog gives the 1,024-character limit.
  - hasEvidenceItems:
      - "[2026-11-14 Cursor docs skill missing description](../../study-results/Cursor/2026-11-14%20Cursor%20docs%20skill%20missing%20description.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: A missing description warns in Cloud Agents; the skill can still be invoked by name.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[description](../../subjects/skill-frontmatter/description.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
