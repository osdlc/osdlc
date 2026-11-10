---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: config/credentials-env
  object:
    supported: true
    vars:
      - name: ANTHROPIC_API_KEY
        kind: api-key
        provider: anthropic
    note: many more provider variables are listed in --help
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Pi help api key variables](../../study-results/Pi/2026-11-09%20Pi%20help%20api%20key%20variables.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: --help lists provider key variables.
  - hasEvidenceItems:
      - "[2026-11-09 Pi help auth](../../study-results/Pi/2026-11-09%20Pi%20help%20auth.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "`pi auth` checks credentials."
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T12:00:00Z
harness: "[Pi](../../harnesses/Pi.md)"
subject: "[Credential variables](../../subjects/config/Credential%20variables.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The /login command name comes from docs mentioned in the changelog, not re-quoted here.

Audit fix 2026-11-09: values without a cited excerpt were removed or cited.
