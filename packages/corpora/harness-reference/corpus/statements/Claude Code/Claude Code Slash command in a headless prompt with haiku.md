---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: cli/headless-slash-command
  object:
    supported: true
    position: prompt start only
    arguments: all text after the command name, newlines included
    later_text: becomes arguments, not context
    not_at_start: not parsed; the model runs the command itself through a tool
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-10 Claude Code slash command after text](../../study-results/Claude%20Code/2026-11-10%20Claude%20Code%20slash%20command%20after%20text.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: >-
      A call after other text was not parsed; haiku called the command itself through a tool,
      with the arguments alpha beta, in 3 turns. One run of a model's choice, so moderate.
  - hasEvidenceItems:
      - "[2026-11-10 Claude Code slash command at prompt start](../../study-results/Claude%20Code/2026-11-10%20Claude%20Code%20slash%20command%20at%20prompt%20start.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: A call at the prompt start was parsed, and every later line became its arguments.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-10T01:05:59Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Slash command in a headless prompt](../../subjects/cli/Slash%20command%20in%20a%20headless%20prompt.md)"
scope:
  since: null
  until: null
  platform: []
  model: haiku
status: current
---

The value repeats the parsing in
[the statement with no model](Claude%20Code%20Slash%20command%20in%20a%20headless%20prompt.md),
since a lookup for haiku returns this statement alone, and adds what haiku did with a call after
other text. Another model may not run the command.
