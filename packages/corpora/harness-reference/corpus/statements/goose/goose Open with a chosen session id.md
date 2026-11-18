---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: cli/open-with-id
  object:
    supported: true
    flags: -n, --name <NAME>
    note: "The caller chooses a name, not the id: the id is generated, and --session-id is refused without --resume. The name works later with --resume --name <NAME>."
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose cli name flag](../../study-results/goose/2026-11-14%20goose%20cli%20name%20flag.md)"
      - "[2026-11-14 goose cli named session create](../../study-results/goose/2026-11-14%20goose%20cli%20named%20session%20create.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: Without --resume, --name creates a session with that name.
  - hasEvidenceItems:
      - "[2026-11-14 goose cli session-id flag](../../study-results/goose/2026-11-14%20goose%20cli%20session-id%20flag.md)"
      - "[2026-11-14 goose cli session-id needs resume](../../study-results/goose/2026-11-14%20goose%20cli%20session-id%20needs%20resume.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: --session-id is only accepted with --resume.
reportedIn:
  - "[aaif-goose goose cli.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli.rs%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Open with a chosen session id](../../subjects/cli/Open%20with%20a%20chosen%20session%20id.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

A new session can be opened under a caller-chosen name with `-n <NAME>`, on `goose session` and `goose run`. The id itself cannot be chosen.
