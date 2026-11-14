---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: cli/append-system-prompt
  object:
    supported: true
    flag: -c developer_instructions="<text>"
    reaches_model: true
    note: "No dedicated flag: a config key set with -c. The text is sent as a developer role message, not added to the base instructions."
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Codex CLI Appended system prompt source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Appended%20system%20prompt%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source at rust-v0.167.2.
reportedIn:
  - "[openai codex config src config_toml.rs at ce21072](../../documents/github.com/openai%20codex%20config%20src%20config_toml.rs%20at%20ce21072.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Appended system prompt](../../subjects/cli/Appended%20system%20prompt.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Does a $skill mention in the prompt still load its skill when developer_instructions is set? No run was made, so keeps_slash_command_parsing is left out.
---

The strength is lowered to moderate: `reaches_model` rests on the config field's own description, not on a run.
