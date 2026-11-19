---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: skill-frontmatter/description
  object:
    supported: true
    required: true
    min_length: 1
    max_length: 1024
    note: "missing or empty: the skill is not loaded; over 1024: a warning, and it still loads"
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Pi skill description required](../../study-results/Pi/2026-11-14%20Pi%20skill%20description%20required.md)"
      - "[2026-11-14 Pi skill description length](../../study-results/Pi/2026-11-14%20Pi%20skill%20description%20length.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The loader drops a skill with no description and warns past 1024 characters.
  - hasEvidenceItems:
      - "[2026-11-14 Pi docs skills not loaded](../../study-results/Pi/2026-11-14%20Pi%20docs%20skills%20not%20loaded.md)"
      - "[2026-11-14 Pi docs skill field limits](../../study-results/Pi/2026-11-14%20Pi%20docs%20skill%20field%20limits.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Skills page.
reportedIn:
  - "[Pi source skills.ts at v1.5.2](../../documents/github.com/Pi%20source%20skills.ts%20at%20v1.5.2.md)"
  - "[Pi docs Skills at v1.5.2](../../documents/github.com/Pi%20docs%20Skills%20at%20v1.5.2.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Pi](../../harnesses/Pi.md)"
subject: "[description](../../subjects/skill-frontmatter/description.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The description is the one field whose absence stops a skill loading.
