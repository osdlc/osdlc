---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: cli/session-id
  object:
    supported: true
    assign_argv:
      - --session-id
      - <id>
    format: letters, numbers, ".", "_" and "-"; must start and end with a letter or number
    env_var: PI_SESSION_ID
    note: opens the existing session with that id in the current directory, else creates it; not combinable with --session, --continue or --resume
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Pi help session-id fork](../../study-results/Pi/2026-11-09%20Pi%20help%20session-id%20fork.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: --session-id in --help.
  - hasEvidenceItems:
      - "[2026-11-09 Pi cli session-id constraint](../../study-results/Pi/2026-11-09%20Pi%20cli%20session-id%20constraint.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: cli.md constraints.
  - hasEvidenceItems:
      - "[2026-11-09 Pi cli session id characters](../../study-results/Pi/2026-11-09%20Pi%20cli%20session%20id%20characters.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Characters.
  - hasEvidenceItems:
      - "[2026-11-09 Pi cli session id edges](../../study-results/Pi/2026-11-09%20Pi%20cli%20session%20id%20edges.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Edges.
  - hasEvidenceItems:
      - "[2026-11-09 Pi env session table](../../study-results/Pi/2026-11-09%20Pi%20env%20session%20table.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: PI_SESSION_ID.
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
subject: "[Session id](../../subjects/cli/Session%20id.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---



Audit fix 2026-11-09: values without a cited excerpt were removed or cited.
