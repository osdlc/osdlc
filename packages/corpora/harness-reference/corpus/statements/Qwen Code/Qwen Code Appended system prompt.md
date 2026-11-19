---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: cli/append-system-prompt
  object:
    supported: true
    flag: --append-system-prompt
    reaches_model: true
    note: applied after the built-in prompt and loaded memory
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Qwen Code Append system prompt option source](../../study-results/Qwen%20Code/2026-11-09%20Qwen%20Code%20Append%20system%20prompt%20option%20source.md)"
      - "[2026-11-14 Qwen Code Append prompt client source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Append%20prompt%20client%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source: the option at v0.27.0, and at v0.27.3 the client passes the text into the system prompt it builds"
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Append system prompt headless docs](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Append%20system%20prompt%20headless%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs at v0.27.3: where the text sits in the prompt"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[Appended system prompt](../../subjects/cli/Appended%20system%20prompt.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The flag adds text to the main session system prompt, and the client puts it in the prompt it sends. `keeps_slash_command_parsing` is left out: no source states it and no run was made.
