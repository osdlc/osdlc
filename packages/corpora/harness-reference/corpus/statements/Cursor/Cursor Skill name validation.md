---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: skills/name-validation
  object:
    checks: length up to 64, lowercase-hyphen form, frontmatter name equals the folder name
    charset: lowercase letters, numbers and hyphens
    length: up to 64
    must_match_directory: true
    blocking: false
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Cursor docs skill name field](../../study-results/Cursor/2026-11-14%20Cursor%20docs%20skill%20name%20field.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The docs give the charset and the folder-name rule.
  - hasEvidenceItems:
      - "[2026-11-14 Cursor changelog skills limits warnings](../../study-results/Cursor/2026-11-14%20Cursor%20changelog%20skills%20limits%20warnings.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The CLI changelog says skills that break these limits load, with a warning in `/skills`.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Skill name validation](../../subjects/skills/Skill%20name%20validation.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

`blocking: false` is from the CLI changelog; no source says what the editor does with a name that fails a check.
