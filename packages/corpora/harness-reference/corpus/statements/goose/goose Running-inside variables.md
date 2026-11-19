---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: cli/current-env
  object:
    supported: true
    vars:
      - name: GOOSE_TERMINAL
        value: "1"
        meaning: a command is being executed by goose
      - name: AGENT
        value: goose
        meaning: generic agent identifier, so tools and scripts can detect goose
    set_by: child-commands
    note: The docs say goose sets both during command execution. At commit 2365bc5 the source sets them only in agents/retry.rs (the shell commands of retry checks); the Developer shell tool sets AGENT_SESSION_ID alone.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose docs GOOSE_TERMINAL](../../study-results/goose/2026-11-14%20goose%20docs%20GOOSE_TERMINAL.md)"
      - "[2026-11-14 goose docs AGENT](../../study-results/goose/2026-11-14%20goose%20docs%20AGENT.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The environment variable guide lists both under Variables Controlled by goose.
  - hasEvidenceItems:
      - "[2026-11-14 goose retry sets GOOSE_TERMINAL and AGENT](../../study-results/goose/2026-11-14%20goose%20retry%20sets%20GOOSE_TERMINAL%20and%20AGENT.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: execute_shell_command in agents/retry.rs sets both on the command it runs.
reportedIn:
  - "[aaif-goose goose environment-variables.md at 2365bc5](../../documents/github.com/aaif-goose%20goose%20environment-variables.md%20at%202365bc5.md)"
  - "[aaif-goose goose retry.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20retry.rs%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Running-inside variables](../../subjects/cli/Running-inside%20variables.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Do commands run by the Developer shell tool get GOOSE_TERMINAL and AGENT in 1.59.0? The docs say so; the source at 2365bc5 sets them only in agents/retry.rs.
---

The docs name `GOOSE_TERMINAL=1` and `AGENT=goose` as the markers. In the source at this commit only the retry check commands get them, so the statement is held at moderate.
