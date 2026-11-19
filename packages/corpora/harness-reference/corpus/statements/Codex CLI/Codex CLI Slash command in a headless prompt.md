---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: cli/headless-slash-command
  object:
    supported: true
    position: anywhere in the prompt, as a $skill-name mention
    arguments: none; the whole prompt is sent as the user message
    later_text: stays in the user message
    not_at_start: still read as a mention
    note: codex exec sends the prompt as one text input. Slash commands are defined only in the interactive TUI.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Codex CLI Headless prompt input source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Headless%20prompt%20input%20source.md)"
      - "[2026-11-14 Codex CLI Skill mention scan source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20mention%20scan%20source.md)"
      - "[2026-11-14 Codex CLI Skill mention syntax source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20mention%20syntax%20source.md)"
      - "[2026-11-14 Codex CLI Slash commands TUI source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Slash%20commands%20TUI%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source at rust-v0.167.2.
reportedIn:
  - "[openai codex exec src lib.rs at ce21072](../../documents/github.com/openai%20codex%20exec%20src%20lib.rs%20at%20ce21072.md)"
  - "[openai codex skills src selection.rs at ce21072](../../documents/github.com/openai%20codex%20skills%20src%20selection.rs%20at%20ce21072.md)"
  - "[openai codex skills src mentions.rs at ce21072](../../documents/github.com/openai%20codex%20skills%20src%20mentions.rs%20at%20ce21072.md)"
  - "[openai codex tui src slash_command.rs at ce21072](../../documents/github.com/openai%20codex%20tui%20src%20slash_command.rs%20at%20ce21072.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Slash command in a headless prompt](../../subjects/cli/Slash%20command%20in%20a%20headless%20prompt.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - What a model does with a leading /command in a codex exec prompt was not run.
---

This covers what the harness parses. `codex exec` passes the prompt on as text, and the session scans every text input for `$name` mentions, wherever they sit. The `SlashCommand` type exists only in the `tui` crate.
