---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: skills/prequalified-name
  object:
    behaviour: kept as written; Pi adds no package prefix, so nothing is doubled; the colon draws an invalid-characters warning and the skill still loads
    example: /skill:acme-tools:review
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Pi skill name fallback](../../study-results/Pi/2026-11-14%20Pi%20skill%20name%20fallback.md)"
      - "[2026-11-14 Pi skill name invalid characters](../../study-results/Pi/2026-11-14%20Pi%20skill%20name%20invalid%20characters.md)"
      - "[2026-11-14 Pi skill description required](../../study-results/Pi/2026-11-14%20Pi%20skill%20description%20required.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The frontmatter name is used as written; a character outside a-z, 0-9 and hyphen only warns.
  - hasEvidenceItems:
      - "[2026-11-14 Pi skill command lookup by name](../../study-results/Pi/2026-11-14%20Pi%20skill%20command%20lookup%20by%20name.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The command is matched on that same name.
reportedIn:
  - "[Pi source skills.ts at v1.5.2](../../documents/github.com/Pi%20source%20skills.ts%20at%20v1.5.2.md)"
  - "[Pi source agent-session.ts at v1.5.2](../../documents/github.com/Pi%20source%20agent-session.ts%20at%20v1.5.2.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Pi](../../harnesses/Pi.md)"
subject: "[Pre-qualified skill name](../../subjects/skills/Pre-qualified%20skill%20name.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Read from the source at v1.5.2, not run, so the statement is held at moderate. See also the plugin skill runtime name statement: Pi never prepends the package name.
