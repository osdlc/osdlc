---
proposition:
  subject: "[Antigravity](../../harnesses/Antigravity.md)"
  predicate: cli/headless-slash-command
  object:
    supported: true
    position: prompt start
    arguments: the text after the command name; a space, tab or newline may separate them
    note: --disable-slash-commands, or disableSlashCommands in settings.json, sends the prompt as typed
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 changelog print mode skill expansion](../../study-results/Antigravity/2026-11-14%20changelog%20print%20mode%20skill%20expansion.md)"
      - "[2026-11-14 changelog command then newline](../../study-results/Antigravity/2026-11-14%20changelog%20command%20then%20newline.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: CLI changelog entries for 1.1.9 describe slash-command and skill expansion in print mode.
  - hasEvidenceItems:
      - "[2026-11-14 reference disableSlashCommands](../../study-results/Antigravity/2026-11-14%20reference%20disableSlashCommands.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The settings table says a prompt that starts with / runs a slash command or skill unless the setting is on.
reportedIn:
  - "[Antigravity CLI CHANGELOG at f51cb8d](../../documents/Google/Antigravity%20CLI%20CHANGELOG%20at%20f51cb8d.md)"
  - "[Antigravity docs CLI commands](../../documents/antigravity.google/Antigravity%20docs%20CLI%20commands.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Antigravity](../../harnesses/Antigravity.md)"
subject: "[Slash command in a headless prompt](../../subjects/cli/Slash%20command%20in%20a%20headless%20prompt.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - What happens to a slash command or skill call that is not at the start of the prompt?
---

Since CLI 1.1.9 a headless prompt such as `-p "/my-skill review this diff"` resolves and applies the skill. The sources speak of a prompt that starts with the command. They do not say how the text after the name is handed to the skill.
