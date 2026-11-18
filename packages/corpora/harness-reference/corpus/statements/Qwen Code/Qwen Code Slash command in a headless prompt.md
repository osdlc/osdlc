---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: cli/headless-slash-command
  object:
    supported: true
    position: prompt start only
    arguments: all text after the command name, trimmed
    not_at_start: not parsed as a command; the prompt goes to the model as text
    note: several leading `/skill` tokens load each skill, and the rest is the prompt
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Headless slash command source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Headless%20slash%20command%20source.md)"
      - "[2026-11-14 Qwen Code isSlashCommand source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20isSlashCommand%20source.md)"
      - "[2026-11-14 Qwen Code Slash command arguments source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Slash%20command%20arguments%20source.md)"
      - "[2026-11-14 Qwen Code Stacked skill invocations source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Stacked%20skill%20invocations%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at v0.27.3: the non-interactive run parses the input as a slash command only when it starts with /"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[Slash command in a headless prompt](../../subjects/cli/Slash%20command%20in%20a%20headless%20prompt.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Read from the source, not run. The non-interactive run checks whether the input starts with `/` (and is not `//`, `/*` or a path) and, if so, hands it to the slash command handler. The arguments are the text after the command name. No model was involved, so `scope.model` is null.
