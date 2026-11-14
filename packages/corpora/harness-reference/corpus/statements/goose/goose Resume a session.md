---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: cli/resume
  object:
    supported: true
    command: goose session --resume [--name <NAME> | --session-id <ID>]
    by: session name or session id; --path is a legacy form
    latest: --resume alone resumes the most recently used session
    flags: -r, --resume; -n, --name; --session-id; --history; --edit; --fork
    argv:
      - run
      - --resume
      - --session-id
      - "{id}"
      - --text
      - "{prompt}"
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose cli session resume flag](../../study-results/goose/2026-11-14%20goose%20cli%20session%20resume%20flag.md)"
      - "[2026-11-14 goose cli session-id flag](../../study-results/goose/2026-11-14%20goose%20cli%20session-id%20flag.md)"
      - "[2026-11-14 goose cli name flag](../../study-results/goose/2026-11-14%20goose%20cli%20name%20flag.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The clap definitions of --resume, --session-id and --name.
  - hasEvidenceItems:
      - "[2026-11-14 goose cli run resume flag](../../study-results/goose/2026-11-14%20goose%20cli%20run%20resume%20flag.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: goose run takes --resume too, so a new prompt can be passed with -t.
  - hasEvidenceItems:
      - "[2026-11-14 goose docs run resume by name](../../study-results/goose/2026-11-14%20goose%20docs%20run%20resume%20by%20name.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The running-tasks guide resumes a named session with goose run -n my-project -r.
reportedIn:
  - "[aaif-goose goose cli.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli.rs%20at%202365bc5.md)"
  - "[aaif-goose goose running-tasks.md at 2365bc5](../../documents/github.com/aaif-goose%20goose%20running-tasks.md%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Resume a session](../../subjects/cli/Resume%20a%20session.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

A session is resumed with `--resume`, by name or by id, on `goose session` and on `goose run`. `goose run --resume ... -t <TEXT>` passes a new prompt.
