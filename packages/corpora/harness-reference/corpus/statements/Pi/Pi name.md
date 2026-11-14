---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: skill-frontmatter/name
  object:
    supported: true
    required: false
    max_length: 64
    note: "when absent, the parent directory name is used; over 64 or invalid characters: a warning, and it still loads"
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Pi skill name fallback](../../study-results/Pi/2026-11-14%20Pi%20skill%20name%20fallback.md)"
      - "[2026-11-14 Pi skill name length](../../study-results/Pi/2026-11-14%20Pi%20skill%20name%20length.md)"
      - "[2026-11-14 Pi skill name invalid characters](../../study-results/Pi/2026-11-14%20Pi%20skill%20name%20invalid%20characters.md)"
      - "[2026-11-14 Pi skill description required](../../study-results/Pi/2026-11-14%20Pi%20skill%20description%20required.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The loader falls back to the directory name and only warns on an invalid name.
  - hasEvidenceItems:
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
subject: "[name](../../subjects/skill-frontmatter/name.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The specification requires `name`; Pi does not.
