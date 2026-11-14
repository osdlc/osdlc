---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: config/credentials-env
  object:
    supported: true
    vars:
      - name: DEEPSEEK_API_KEY
        kind: api-key
        provider: deepseek
        precedence: a stored credential takes precedence over the variable
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 credentials env](../../study-results/DeepSeek%20Harness/2026-11-09%20credentials%20env.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: source observed 2026-11-09.
reportedIn:
  - "[deepseek-ai deepseek-harness credentials README at fcc0ad4](../../documents/github.com/deepseek-ai%20deepseek-harness%20credentials%20README%20at%20fcc0ad4.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: strength lowered
    date: 2026-11-14T18:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[Credential variables](../../subjects/config/Credential%20variables.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Strength lowered on 2026-11-14: the evidence rated strong is README or guide prose in the repository, which this corpus counts as docs (moderate), not source. The study results keep their `kind`, since study results are not edited.
