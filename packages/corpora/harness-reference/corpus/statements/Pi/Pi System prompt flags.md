---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: instructions/system-prompt-flag
  object:
    supported: true
    replace_argv:
      - --system-prompt
      - "{text}"
    append_argv:
      - --append-system-prompt
      - "{text}"
    note: --append-system-prompt takes text or file contents and can be repeated
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Pi help system prompt](../../study-results/Pi/2026-11-09%20Pi%20help%20system%20prompt.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: --help.
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
subject: "[System prompt flags](../../subjects/instructions/System%20prompt%20flags.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Text-or-file behavior comes from the --append-system-prompt help line; --system-prompt help says only <text>.

Audit fix 2026-11-09: values without a cited excerpt were removed or cited.
