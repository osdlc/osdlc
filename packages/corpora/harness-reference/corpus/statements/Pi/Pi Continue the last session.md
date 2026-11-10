---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: cli/continue
  object:
    supported: true
    argv:
      - --continue
    chosen_by: the most recent session for the current directory
    accepts_prompt: true
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Pi help continue session](../../study-results/Pi/2026-11-09%20Pi%20help%20continue%20session.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: --continue, -c in --help.
  - hasEvidenceItems:
      - "[2026-11-09 Pi help continue example](../../study-results/Pi/2026-11-09%20Pi%20help%20continue%20example.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: Help example passes a prompt with --continue.
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
subject: "[Continue the last session](../../subjects/cli/Continue%20the%20last%20session.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---



Audit fix 2026-11-09: values without a cited excerpt were removed or cited.
