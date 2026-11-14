---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: cli/session-id
  object:
    supported: partial
    format: YYYYMMDD_<COUNT>, such as 20250310_2
    reported_in:
      - env
    env_var: AGENT_SESSION_ID
    obtained_by: command
    command:
      - goose
      - session
      - list
      - --format
      - json
    note: No flag assigns an id; -n, --name sets a name instead. The json output of goose run holds messages and metadata, with no session id field. In a session, /status shows the id.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose docs session id format](../../study-results/goose/2026-11-14%20goose%20docs%20session%20id%20format.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The logs guide gives the id format.
  - hasEvidenceItems:
      - "[2026-11-14 goose session id sql](../../study-results/goose/2026-11-14%20goose%20session%20id%20sql.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: create_session builds the id from the date and a counter.
  - hasEvidenceItems:
      - "[2026-11-14 goose cli session list command](../../study-results/goose/2026-11-14%20goose%20cli%20session%20list%20command.md)"
      - "[2026-11-14 goose cli session-id needs resume](../../study-results/goose/2026-11-14%20goose%20cli%20session-id%20needs%20resume.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: goose session list has a json format, and --session-id is refused without --resume.
  - hasEvidenceItems:
      - "[2026-11-14 goose cli json output struct](../../study-results/goose/2026-11-14%20goose%20cli%20json%20output%20struct.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The json output struct has no session id field.
  - hasEvidenceItems:
      - "[2026-11-14 goose shell sets AGENT_SESSION_ID](../../study-results/goose/2026-11-14%20goose%20shell%20sets%20AGENT_SESSION_ID.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The Developer shell exports the id as AGENT_SESSION_ID.
  - hasEvidenceItems:
      - "[2026-11-14 goose docs status command](../../study-results/goose/2026-11-14%20goose%20docs%20status%20command.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The CLI reference says /status shows the session id.
reportedIn:
  - "[aaif-goose goose logs.md at 2365bc5](../../documents/github.com/aaif-goose%20goose%20logs.md%20at%202365bc5.md)"
  - "[aaif-goose goose session_manager.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20session_manager.rs%20at%202365bc5.md)"
  - "[aaif-goose goose cli.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli.rs%20at%202365bc5.md)"
  - "[aaif-goose goose cli session mod.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli%20session%20mod.rs%20at%202365bc5.md)"
  - "[aaif-goose goose developer shell.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20developer%20shell.rs%20at%202365bc5.md)"
  - "[aaif-goose goose goose-cli-commands.md at 2365bc5](../../documents/github.com/aaif-goose%20goose%20goose-cli-commands.md%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Session id](../../subjects/cli/Session%20id.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Session ids are generated as `YYYYMMDD_<COUNT>`. A caller cannot assign one; it reads ids from `goose session list` or, inside the session, from `AGENT_SESSION_ID`.
