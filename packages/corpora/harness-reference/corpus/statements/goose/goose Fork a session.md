---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: cli/fork
  object:
    supported: true
    command: goose session --resume --fork [--name <NAME> | --session-id <ID>]
    flags: --fork (requires --resume); --edit opens the copied conversation in $EDITOR first
    note: "Interactive sessions only: goose run always passes fork: false. With no name or id it forks the most recently used session."
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose cli fork flag](../../study-results/goose/2026-11-14%20goose%20cli%20fork%20flag.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: goose session defines --fork, which needs --resume and copies the history into a new session.
  - hasEvidenceItems:
      - "[2026-11-14 goose cli run never forks](../../study-results/goose/2026-11-14%20goose%20cli%20run%20never%20forks.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "handle_run_command builds its session with fork: false."
reportedIn:
  - "[aaif-goose goose cli.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli.rs%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Fork a session](../../subjects/cli/Fork%20a%20session.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

`goose session --resume --fork` creates a new session with the history of an earlier one. `goose run` has no fork flag.
