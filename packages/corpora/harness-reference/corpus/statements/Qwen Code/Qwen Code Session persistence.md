---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: cli/session-persistence
  object:
    supported: true
    config_key: general.chatRecording
    disable_argv:
      - --chat-recording=false
    note: with recording off, chat history is not saved and --continue and --resume do not work
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Qwen Code Chat recording option source](../../study-results/Qwen%20Code/2026-11-09%20Qwen%20Code%20Chat%20recording%20option%20source.md)"
      - "[2026-11-09 Qwen Code Chat recording settings docs](../../study-results/Qwen%20Code/2026-11-09%20Qwen%20Code%20Chat%20recording%20settings%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: option source and settings docs.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[Session persistence](../../subjects/cli/Session%20persistence.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
