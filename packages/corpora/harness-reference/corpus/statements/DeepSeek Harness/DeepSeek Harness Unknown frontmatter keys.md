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
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 DeepSeek Harness Unknown frontmatter keys](../../study-results/DeepSeek%20Harness/2026-11-04%20DeepSeek%20Harness%20Unknown%20frontmatter%20keys.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: source observed 2026-11-04.
reportedIn:
  - "[dsh skill-filesystem package README](../../documents/github.com/dsh%20skill-filesystem%20package%20README.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: strength lowered
    date: 2026-11-14T18:00:00Z
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

Strength lowered on 2026-11-14: the evidence rated strong is README or guide prose in the repository, which this corpus counts as docs (moderate), not source. The study results keep their `kind`, since study results are not edited.
