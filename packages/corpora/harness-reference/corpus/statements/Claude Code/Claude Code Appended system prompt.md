---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: cli/append-system-prompt
  object:
    supported: true
    flag: --append-system-prompt
    keeps_slash_command_parsing: true
    reaches_model: true
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-10 Claude Code slash command with appended system prompt](../../study-results/Claude%20Code/2026-11-10%20Claude%20Code%20slash%20command%20with%20appended%20system%20prompt.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: With the flag set, a call at the prompt start was parsed with exactly alpha beta, in 1 turn.
  - hasEvidenceItems:
      - "[2026-11-10 Claude Code appended run id](../../study-results/Claude%20Code/2026-11-10%20Claude%20Code%20appended%20run%20id.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The model replied with the run id that only the appended text held.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-10T01:05:59Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Appended system prompt](../../subjects/cli/Appended%20system%20prompt.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
