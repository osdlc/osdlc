---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: cli/resume
  object:
    supported: true
    flags: --resume [chatId]
    latest: --continue or `agent resume`
    picker: "`agent ls`"
    command: agent resume
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Cursor help resume continue](../../study-results/Cursor/2026-11-09%20Cursor%20help%20resume%20continue.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: Installed --help lists --resume [chatId] and --continue.
  - hasEvidenceItems:
      - "[2026-11-09 Cursor help ls resume](../../study-results/Cursor/2026-11-09%20Cursor%20help%20ls%20resume.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "`ls` and `resume` subcommands."
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Resume a session](../../subjects/cli/Resume%20a%20session.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
