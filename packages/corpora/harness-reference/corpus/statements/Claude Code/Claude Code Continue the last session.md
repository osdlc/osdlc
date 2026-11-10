---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: cli/continue
  object:
    supported: true
    argv:
      - --continue
    chosen_by: most recent conversation in the current working directory
    note: -c is the short form. Without -p it skips sessions created with `claude -p` or the Agent SDK; `claude -p --continue` includes them.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 help continue](../../study-results/Claude%20Code/2026-11-09%20help%20continue.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "`-c, --continue` continues the most recent conversation in the current directory."
  - hasEvidenceItems:
      - "[2026-11-09 docs cli continue](../../study-results/Claude%20Code/2026-11-09%20docs%20cli%20continue.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The CLI reference says which sessions it skips and that -p --continue includes print sessions.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T07:53:54Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Continue the last session](../../subjects/cli/Continue%20the%20last%20session.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
