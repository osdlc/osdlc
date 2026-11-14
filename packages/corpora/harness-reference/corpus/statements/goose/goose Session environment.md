---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: cli/session-env
  object:
    vars:
      - AGENT_SESSION_ID
      - GOOSE_TERMINAL
      - AGENT
    note: AGENT_SESSION_ID is set for Developer shell commands and stdio extensions. GOOSE_TERMINAL and AGENT are documented; the source at 2365bc5 sets them only on retry check commands.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose shell sets AGENT_SESSION_ID](../../study-results/goose/2026-11-14%20goose%20shell%20sets%20AGENT_SESSION_ID.md)"
      - "[2026-11-14 goose stdio extension gets AGENT_SESSION_ID](../../study-results/goose/2026-11-14%20goose%20stdio%20extension%20gets%20AGENT_SESSION_ID.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The Developer shell and the stdio extension launcher set AGENT_SESSION_ID.
  - hasEvidenceItems:
      - "[2026-11-14 goose docs AGENT_SESSION_ID](../../study-results/goose/2026-11-14%20goose%20docs%20AGENT_SESSION_ID.md)"
      - "[2026-11-14 goose docs GOOSE_TERMINAL](../../study-results/goose/2026-11-14%20goose%20docs%20GOOSE_TERMINAL.md)"
      - "[2026-11-14 goose docs AGENT](../../study-results/goose/2026-11-14%20goose%20docs%20AGENT.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The environment variable guide lists the three variables goose sets.
  - hasEvidenceItems:
      - "[2026-11-14 goose retry sets GOOSE_TERMINAL and AGENT](../../study-results/goose/2026-11-14%20goose%20retry%20sets%20GOOSE_TERMINAL%20and%20AGENT.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: agents/retry.rs sets GOOSE_TERMINAL and AGENT on the command it runs.
reportedIn:
  - "[aaif-goose goose developer shell.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20developer%20shell.rs%20at%202365bc5.md)"
  - "[aaif-goose goose extension_manager mod.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20extension_manager%20mod.rs%20at%202365bc5.md)"
  - "[aaif-goose goose environment-variables.md at 2365bc5](../../documents/github.com/aaif-goose%20goose%20environment-variables.md%20at%202365bc5.md)"
  - "[aaif-goose goose retry.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20retry.rs%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Session environment](../../subjects/cli/Session%20environment.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

`AGENT_SESSION_ID` carries the session id to shell commands and stdio extensions. The docs also list `GOOSE_TERMINAL` and `AGENT`.
