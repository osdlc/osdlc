---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: cli/limits
  object:
    supported: true
    max_turns:
      argv:
        - --max-session-turns
        - "{n}"
      config_key: model.maxSessionTurns
    timeout:
      argv:
        - --max-wall-time
        - "{seconds}"
    on_limit: --max-wall-time and --max-tool-calls abort the run with exit code 55
    note: --max-tool-calls caps cumulative tool calls
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Qwen Code Max session turns option source](../../study-results/Qwen%20Code/2026-11-09%20Qwen%20Code%20Max%20session%20turns%20option%20source.md)"
      - "[2026-11-09 Qwen Code Max wall time option source](../../study-results/Qwen%20Code/2026-11-09%20Qwen%20Code%20Max%20wall%20time%20option%20source.md)"
      - "[2026-11-09 Qwen Code Max wall time exit code source](../../study-results/Qwen%20Code/2026-11-09%20Qwen%20Code%20Max%20wall%20time%20exit%20code%20source.md)"
      - "[2026-11-09 Qwen Code Max tool calls option source](../../study-results/Qwen%20Code/2026-11-09%20Qwen%20Code%20Max%20tool%20calls%20option%20source.md)"
      - "[2026-11-09 Qwen Code Max tool calls exit code source](../../study-results/Qwen%20Code/2026-11-09%20Qwen%20Code%20Max%20tool%20calls%20exit%20code%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: option source at v0.27.0.
  - hasEvidenceItems:
      - "[2026-11-09 Qwen Code Max session turns settings docs](../../study-results/Qwen%20Code/2026-11-09%20Qwen%20Code%20Max%20session%20turns%20settings%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: settings docs.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[Run limits](../../subjects/cli/Run%20limits.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
