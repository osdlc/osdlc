---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: cli/open-with-id
  object:
    supported: true
    flags: --session <id> --title <title>
    note: a --session id that does not exist is created; --title names a new session
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode run session flag source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20run%20session%20flag%20source%20v2.3.0.md)"
      - "[2026-11-14 OpenCode session create with id source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20session%20create%20with%20id%20source%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The flag text says a missing id is created, and the session target code passes the given id to session.create.
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode run title flag source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20run%20title%20flag%20source%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The run command has a --title flag for the session title.
reportedIn:
  - "[OpenCode source commands commands.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20commands%20commands.ts%20at%20a6b15d3.md)"
  - "[OpenCode source cli session-target.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20cli%20session-target.ts%20at%20a6b15d3.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Open with a chosen session id](../../subjects/cli/Open%20with%20a%20chosen%20session%20id.md)"
scope:
  since: 2.3.0
  until: null
  platform: []
  model: null
status: current
open:
  - Must a caller-chosen id follow a set form, such as the ses_ prefix the docs show?
---

Read from source at v2.3.0. The run code applies `--title` only to a session it has just created.
