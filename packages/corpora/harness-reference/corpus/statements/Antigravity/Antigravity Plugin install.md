---
proposition:
  subject: "[Antigravity](../../harnesses/Antigravity.md)"
  predicate: plugins/install
  object:
    commands:
      - agy plugin install <plugin-name>@antigravity-plugins-official
      - agy plugin install https://github.com/<owner>/<repo>
      - agy plugin install </path/to/local/plugin>
    sources: the official marketplace, a GitHub repository URL or a local directory
    claude_plugins: agy plugin import claude migrates plugins from ~/.claude/plugins; each command becomes a skill named after its folder
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 plugins install sources](../../study-results/Antigravity/2026-11-14%20plugins%20install%20sources.md)"
      - "[2026-11-14 plugins install marketplace command](../../study-results/Antigravity/2026-11-14%20plugins%20install%20marketplace%20command.md)"
      - "[2026-11-14 plugins install commands](../../study-results/Antigravity/2026-11-14%20plugins%20install%20commands.md)"
      - "[2026-11-14 plugins import](../../study-results/Antigravity/2026-11-14%20plugins%20import.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The plugins page lists the install and import commands.
  - hasEvidenceItems:
      - "[2026-11-14 changelog import commands as skills](../../study-results/Antigravity/2026-11-14%20changelog%20import%20commands%20as%20skills.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The 1.5.5 changelog says an imported Claude Code command becomes a skill named after its folder.
reportedIn:
  - "[Antigravity docs Plugins antigravity.google](../../documents/antigravity.google/Antigravity%20docs%20Plugins%20antigravity.google.md)"
  - "[Antigravity CLI CHANGELOG at f51cb8d](../../documents/Google/Antigravity%20CLI%20CHANGELOG%20at%20f51cb8d.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Antigravity](../../harnesses/Antigravity.md)"
subject: "[Plugin install](../../subjects/plugins/Plugin%20install.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The same subcommands run inside the TUI as `/plugin install ...`. A marketplace install needs a signed-in `agy`.
