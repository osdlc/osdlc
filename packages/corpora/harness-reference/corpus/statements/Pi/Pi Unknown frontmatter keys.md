---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: skill-frontmatter/unknown-keys
  object:
    behavior: ignored without a warning
    known_keys:
      - name
      - description
      - disable-model-invocation
    validated:
      - name
      - description
    invalid_name_or_no_frontmatter: an invalid name warns and the skill still loads; a skill with no description is not loaded
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Pi skill frontmatter interface](../../study-results/Pi/2026-11-14%20Pi%20skill%20frontmatter%20interface.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The frontmatter type takes any other key and the loader reads only the three named ones.
  - hasEvidenceItems:
      - "[2026-11-14 Pi skill description required](../../study-results/Pi/2026-11-14%20Pi%20skill%20description%20required.md)"
      - "[2026-11-14 Pi skill name invalid characters](../../study-results/Pi/2026-11-14%20Pi%20skill%20name%20invalid%20characters.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: Validation covers name and description only.
  - hasEvidenceItems:
      - "[2026-11-14 Pi docs skills not loaded](../../study-results/Pi/2026-11-14%20Pi%20docs%20skills%20not%20loaded.md)"
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
subject: "[Unknown frontmatter keys](../../subjects/skill-frontmatter/Unknown%20frontmatter%20keys.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[Pi Unknown frontmatter keys open](Pi%20Unknown%20frontmatter%20keys%20open.md)"
---

Read from the loader at v1.5.2. The open statement for this subject asked this question; the source answers it.
