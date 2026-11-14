---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: skill-frontmatter/extensions
  object:
    fields:
      - paths
      - globs
      - disable-model-invocation
      - user-invocable
      - icon
      - color
    note: "`globs` is a legacy fallback for `paths`; `user-invocable` is named in the CLI changelog, not in the docs table"
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Cursor docs skill paths field](../../study-results/Cursor/2026-11-14%20Cursor%20docs%20skill%20paths%20field.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "`paths`."
  - hasEvidenceItems:
      - "[2026-11-14 Cursor docs skill globs fallback](../../study-results/Cursor/2026-11-14%20Cursor%20docs%20skill%20globs%20fallback.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "`globs`."
  - hasEvidenceItems:
      - "[2026-11-14 Cursor docs skill disable-model-invocation field](../../study-results/Cursor/2026-11-14%20Cursor%20docs%20skill%20disable-model-invocation%20field.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "`disable-model-invocation`."
  - hasEvidenceItems:
      - "[2026-11-14 Cursor changelog user-invocable](../../study-results/Cursor/2026-11-14%20Cursor%20changelog%20user-invocable.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "`user-invocable`."
  - hasEvidenceItems:
      - "[2026-11-14 Cursor docs skill icon field](../../study-results/Cursor/2026-11-14%20Cursor%20docs%20skill%20icon%20field.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "`icon`."
  - hasEvidenceItems:
      - "[2026-11-14 Cursor docs skill color field](../../study-results/Cursor/2026-11-14%20Cursor%20docs%20skill%20color%20field.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "`color`."
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Harness-only fields](../../subjects/skill-frontmatter/Harness-only%20fields.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The fields are those Cursor documents that the Agent Skills spec (name, description, license, compatibility, metadata, allowed-tools) does not define.
