---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: skill-frontmatter/unknown-keys
  object:
    known_keys:
      - name
      - description
      - whenToUse
      - metadata
      - disable-model-invocation
      - user-invocable
    invalid_invocation_value: whole skill dropped with a warning
    invalid_name_or_no_frontmatter: skipped with a warning
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 DeepSeek Harness Unknown frontmatter keys](../../study-results/DeepSeek%20Harness/2026-11-04%20DeepSeek%20Harness%20Unknown%20frontmatter%20keys.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-04.
reportedIn:
  - "[dsh skill-filesystem package README](../../documents/github.com/dsh%20skill-filesystem%20package%20README.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[Unknown frontmatter keys](../../subjects/skill-frontmatter/Unknown%20frontmatter%20keys.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - What happens with a frontmatter key outside the known list?
imported_from: fact:skill-frontmatter/unknown-keys@dsh#scope-[null,null,null]
---

Imported from `facts/dsh/skill-frontmatter/unknown-keys.md`.

Open questions:
- What happens with a frontmatter key outside the known list?
