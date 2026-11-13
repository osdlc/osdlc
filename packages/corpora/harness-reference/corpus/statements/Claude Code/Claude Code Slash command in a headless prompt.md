---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: cli/headless-slash-command
  object:
    supported: true
    position: prompt start only
    arguments: all text after the command name, newlines included
    later_text: becomes arguments, not context
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-10 Claude Code slash command at prompt start](../../study-results/Claude%20Code/2026-11-10%20Claude%20Code%20slash%20command%20at%20prompt%20start.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: A call at the prompt start was parsed, and every later line became its arguments.
  - hasEvidenceItems:
      - "[2026-11-10 Claude Code slash command after text](../../study-results/Claude%20Code/2026-11-10%20Claude%20Code%20slash%20command%20after%20text.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: A call after other text was not parsed as a command.
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
  model: null
status: current
---

Each run used `--model haiku`. Parsing happens before the model sees the prompt (one turn), so
this statement does not name a model. What the model does with a call it was not given as a
command is in [the haiku statement](Claude%20Code%20Slash%20command%20in%20a%20headless%20prompt%20with%20haiku.md).
