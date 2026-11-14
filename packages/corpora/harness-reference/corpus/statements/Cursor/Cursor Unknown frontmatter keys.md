---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: skill-frontmatter/unknown-keys
  object:
    documented_keys:
      - name
      - description
      - paths
      - disable-model-invocation
      - icon
      - color
      - metadata
      - globs
      - user-invocable
    note: no source says what happens to a key outside this list; `globs` is a legacy fallback and `user-invocable` comes from the CLI changelog
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Cursor docs skill name field](../../study-results/Cursor/2026-11-14%20Cursor%20docs%20skill%20name%20field.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "`name`."
  - hasEvidenceItems:
      - "[2026-11-14 Cursor docs skill description field](../../study-results/Cursor/2026-11-14%20Cursor%20docs%20skill%20description%20field.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "`description`."
  - hasEvidenceItems:
      - "[2026-11-14 Cursor docs skill paths field](../../study-results/Cursor/2026-11-14%20Cursor%20docs%20skill%20paths%20field.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "`paths`."
  - hasEvidenceItems:
      - "[2026-11-14 Cursor docs skill disable-model-invocation field](../../study-results/Cursor/2026-11-14%20Cursor%20docs%20skill%20disable-model-invocation%20field.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "`disable-model-invocation`."
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
  - hasEvidenceItems:
      - "[2026-11-14 Cursor docs skill metadata field](../../study-results/Cursor/2026-11-14%20Cursor%20docs%20skill%20metadata%20field.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "`metadata`."
  - hasEvidenceItems:
      - "[2026-11-14 Cursor docs skill globs fallback](../../study-results/Cursor/2026-11-14%20Cursor%20docs%20skill%20globs%20fallback.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "`globs`."
  - hasEvidenceItems:
      - "[2026-11-14 Cursor changelog user-invocable](../../study-results/Cursor/2026-11-14%20Cursor%20changelog%20user-invocable.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "`user-invocable`."
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Unknown frontmatter keys](../../subjects/skill-frontmatter/Unknown%20frontmatter%20keys.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[Cursor Unknown frontmatter keys open](Cursor%20Unknown%20frontmatter%20keys%20open.md)"
open:
  - "What happens with a frontmatter key outside name, description, paths, disable-model-invocation, icon, color and metadata: ignored, warned or rejected?"
---

Only the documented keys are recorded. Whether an unknown key is ignored, warned about or rejected stays open.
