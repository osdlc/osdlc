---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: instructions/system-prompt-flag
  object:
    supported: true
    replace_argv:
      - --system-prompt
      - "{text}"
    append_argv:
      - --append-system-prompt
      - "{text}"
    note: the two flags can be combined and apply to the main session system prompt
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Qwen Code System prompt option source](../../study-results/Qwen%20Code/2026-11-09%20Qwen%20Code%20System%20prompt%20option%20source.md)"
      - "[2026-11-09 Qwen Code Append system prompt option source](../../study-results/Qwen%20Code/2026-11-09%20Qwen%20Code%20Append%20system%20prompt%20option%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: option source at v0.27.0.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[System prompt flags](../../subjects/instructions/System%20prompt%20flags.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
