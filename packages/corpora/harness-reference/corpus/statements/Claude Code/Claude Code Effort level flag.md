---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: cli/effort
  object:
    supported: true
    argv:
      - --effort
      - "{level}"
    env:
      CLAUDE_CODE_EFFORT_LEVEL: low | medium | high | xhigh | max
    config_key: effortLevel
    levels:
      - low
      - medium
      - high
      - xhigh
      - max
    below_low: the lowest accepted level is low
    note: The docs also accept ultracode on 2.1.203 or later, which requests xhigh with ultracode on. Available levels depend on the model. CLAUDE_CODE_EFFORT_LEVEL takes precedence over --effort.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 docs cli effort](../../study-results/Claude%20Code/2026-11-09%20docs%20cli%20effort.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The CLI reference adds ultracode and names the effortLevel setting.
  - hasEvidenceItems:
      - "[2026-11-09 docs env EFFORT](../../study-results/Claude%20Code/2026-11-09%20docs%20env%20EFFORT.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: CLAUDE_CODE_EFFORT_LEVEL sets the level and wins over --effort.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T07:53:54Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Effort level flag](../../subjects/cli/Effort%20level%20flag.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
