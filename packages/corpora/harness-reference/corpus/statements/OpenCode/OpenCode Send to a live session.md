---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: cli/send-to-live
  object:
    supported: true
    command: opencode run --session <id> <message>
    mechanism: the run submits the message as a session prompt with delivery steer to the server that owns the session; a steer is taken up at a step boundary while the session works
    limit: the run must reach the server that owns the session, by default the shared background server; --standalone starts a private one
    note: read from source and docs, not observed in a run
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode run prompt steer source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20run%20prompt%20steer%20source%20v2.3.0.md)"
      - "[2026-11-14 OpenCode inbox steer promotion source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20inbox%20steer%20promotion%20source%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The headless run sends its message with session.prompt and delivery steer to the given session id, and the inbox code promotes steers at a step boundary mid-work.
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode cli docs background service v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20cli%20docs%20background%20service%20v2.3.0.md)"
      - "[2026-11-14 OpenCode tui docs steer v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20tui%20docs%20steer%20v2.3.0.md)"
      - "[2026-11-14 OpenCode plugin docs prompt delivery v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20plugin%20docs%20prompt%20delivery%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The docs say every local client connects to one shared server that owns sessions, that a prompt sent while OpenCode works steers the active session, and that delivery is steer by default.
reportedIn:
  - "[OpenCode source run noninteractive.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20run%20noninteractive.ts%20at%20a6b15d3.md)"
  - "[OpenCode source session inbox.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20session%20inbox.ts%20at%20a6b15d3.md)"
  - "[OpenCode docs source cli index at a6b15d3](../../documents/github.com/OpenCode%20docs%20source%20cli%20index%20at%20a6b15d3.md)"
  - "[OpenCode docs source cli tui at a6b15d3](../../documents/github.com/OpenCode%20docs%20source%20cli%20tui%20at%20a6b15d3.md)"
  - "[OpenCode docs source Build plugins server at a6b15d3](../../documents/github.com/OpenCode%20docs%20source%20Build%20plugins%20server%20at%20a6b15d3.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Send to a live session](../../subjects/cli/Send%20to%20a%20live%20session.md)"
scope:
  since: 2.3.0
  until: null
  platform: []
  model: null
status: current
---

This is put together from source and docs at v2.3.0; nobody ran it. The strength is lowered to moderate for that reason.
