---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: cli/headless-slash-command
  object:
    supported: false
    note: opencode run sends the message text unchanged as a session prompt, with no skill attached; a leading slash is parsed in the TUI prompt code
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode run message passed source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20run%20message%20passed%20source%20v2.3.0.md)"
      - "[2026-11-14 OpenCode run prompt steer source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20run%20prompt%20steer%20source%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The run passes the message text straight to session.prompt and sets no command or skill. A listing that lacks an option is evidence of absence, one step below its kind.
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode tui slash parse source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20tui%20slash%20parse%20source%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The slash head parser sits in the TUI package, which a headless run does not use.
reportedIn:
  - "[OpenCode source run run.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20run%20run.ts%20at%20a6b15d3.md)"
  - "[OpenCode source run noninteractive.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20run%20noninteractive.ts%20at%20a6b15d3.md)"
  - "[OpenCode source tui prompt parse.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20tui%20prompt%20parse.ts%20at%20a6b15d3.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Slash command in a headless prompt](../../subjects/cli/Slash%20command%20in%20a%20headless%20prompt.md)"
scope:
  since: 2.3.0
  until: null
  platform: []
  model: null
status: current
---

Read from source at v2.3.0, not observed in a run. The model may still load a skill itself through the `skill` tool; that part depends on the model.
