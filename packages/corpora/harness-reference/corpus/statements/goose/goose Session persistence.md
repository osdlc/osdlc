---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: cli/session-persistence
  object:
    supported: true
    persists_by_default: true
    disable_argv:
      - --no-session
    store: ~/.local/share/goose/sessions/sessions.db
    note: goose run only; --no-session conflicts with --resume, --name and --path. The store path is the Unix one; it is an SQLite database. In the source, --no-session creates a session of type Hidden instead of a user session.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose cli no-session flag](../../study-results/goose/2026-11-14%20goose%20cli%20no-session%20flag.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The clap definition of --no-session.
  - hasEvidenceItems:
      - "[2026-11-14 goose builder no-session hidden session](../../study-results/goose/2026-11-14%20goose%20builder%20no-session%20hidden%20session.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: With --no-session the builder creates a session of type Hidden.
  - hasEvidenceItems:
      - "[2026-11-14 goose docs no-session](../../study-results/goose/2026-11-14%20goose%20docs%20no-session.md)"
      - "[2026-11-14 goose docs session store](../../study-results/goose/2026-11-14%20goose%20docs%20session%20store.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The docs describe --no-session and where sessions are stored.
reportedIn:
  - "[aaif-goose goose cli.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli.rs%20at%202365bc5.md)"
  - "[aaif-goose goose session builder.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20session%20builder.rs%20at%202365bc5.md)"
  - "[aaif-goose goose running-tasks.md at 2365bc5](../../documents/github.com/aaif-goose%20goose%20running-tasks.md%20at%202365bc5.md)"
  - "[aaif-goose goose logs.md at 2365bc5](../../documents/github.com/aaif-goose%20goose%20logs.md%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Session persistence](../../subjects/cli/Session%20persistence.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Runs are saved to an SQLite database by default. `goose run --no-session` runs without a stored user session.
