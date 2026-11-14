---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: cli/append-system-prompt
  object:
    supported: true
    flag: --append-system-prompt
    keeps_slash_command_parsing: true
    reaches_model: true
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Pi help system prompt](../../study-results/Pi/2026-11-09%20Pi%20help%20system%20prompt.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "`pi --help` lists the flag."
  - hasEvidenceItems:
      - "[2026-11-14 Pi append system prompt section](../../study-results/Pi/2026-11-14%20Pi%20append%20system%20prompt%20section.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The appended text becomes the addendum section of the system prompt.
  - hasEvidenceItems:
      - "[2026-11-14 Pi print mode prompt call](../../study-results/Pi/2026-11-14%20Pi%20print%20mode%20prompt%20call.md)"
      - "[2026-11-14 Pi prompt expansion](../../study-results/Pi/2026-11-14%20Pi%20prompt%20expansion.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Print mode sends the prompt through session.prompt, which expands /skill:name and prompt templates with no check of the system prompt options. Read from source, not run, so one step lower.
reportedIn:
  - "[Pi source system-prompt.ts at v1.5.2](../../documents/github.com/Pi%20source%20system-prompt.ts%20at%20v1.5.2.md)"
  - "[Pi source agent-session.ts at v1.5.2](../../documents/github.com/Pi%20source%20agent-session.ts%20at%20v1.5.2.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Pi](../../harnesses/Pi.md)"
subject: "[Appended system prompt](../../subjects/cli/Appended%20system%20prompt.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Read from the source at v1.5.2; no headless run was made. The statement is held at moderate for that reason.
