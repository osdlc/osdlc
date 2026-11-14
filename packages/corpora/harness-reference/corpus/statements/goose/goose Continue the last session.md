---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: cli/continue
  object:
    supported: true
    argv:
      - --resume
    chosen_by: the most recently used session; the code takes the first entry of the user session list, with no working-directory filter
    accepts_prompt: true
    note: -r is the short form. Works on goose session and goose run; with -n <NAME> or --session-id <ID> it resumes that session instead.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose cli session resume flag](../../study-results/goose/2026-11-14%20goose%20cli%20session%20resume%20flag.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The help text of goose session --resume says it resumes the most recently used session when no name or id is given.
  - hasEvidenceItems:
      - "[2026-11-14 goose cli run resume flag](../../study-results/goose/2026-11-14%20goose%20cli%20run%20resume%20flag.md)"
      - "[2026-11-14 goose cli resume picks first user session](../../study-results/goose/2026-11-14%20goose%20cli%20resume%20picks%20first%20user%20session.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: goose run has the same flag; with no identifier the code takes the first user session.
reportedIn:
  - "[aaif-goose goose cli.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli.rs%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Continue the last session](../../subjects/cli/Continue%20the%20last%20session.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

`--resume` with no name or id continues the latest session, on both `goose session` and `goose run`. With `goose run` a new prompt is passed with `-t`.
