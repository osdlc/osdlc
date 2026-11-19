---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: cli/fork
  object:
    supported: true
    flags: --resume <id> --fork-session
    command: /branch
    note: "`--fork-session` also works with `--continue`; `/branch` forks the current conversation from inside a session"
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Fork session option source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Fork%20session%20option%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: option source at v0.27.3
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Branch command docs](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Branch%20command%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs at v0.27.3: the /branch command"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[Fork a session](../../subjects/cli/Fork%20a%20session.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

`--fork-session` makes a new session from the one being resumed. Inside a session, `/branch` does the same for the current conversation.
