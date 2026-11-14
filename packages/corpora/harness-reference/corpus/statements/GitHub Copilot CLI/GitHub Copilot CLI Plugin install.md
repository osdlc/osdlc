---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: plugins/install
  object:
    commands:
      - copilot plugin install <plugin>@<marketplace>
    sources: a plugin from a registered marketplace, a GitHub repository (OWNER/REPO), a repository subdirectory (OWNER/REPO:PATH/TO/PLUGIN), a Git URL, or a local directory
    recorded_in: plugin metadata in config.json in the configuration directory
    note: "`add` is an alias of `install`"
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 GitHub Copilot CLI Plugin install command docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Plugin%20install%20command%20docs.md)"
      - "[2026-11-14 GitHub Copilot CLI Plugin install specification docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Plugin%20install%20specification%20docs.md)"
      - "[2026-11-14 GitHub Copilot CLI Plugin install subdirectory docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Plugin%20install%20subdirectory%20docs.md)"
      - "[2026-11-14 GitHub Copilot CLI Plugin install local path docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Plugin%20install%20local%20path%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The plugin reference lists the command and the specification formats.
  - hasEvidenceItems:
      - "[2026-11-14 GitHub Copilot CLI Plugin metadata in config.json docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Plugin%20metadata%20in%20config.json%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The configuration directory reference says where plugin metadata is kept.
reportedIn:
  - "[Copilot docs CLI plugin reference](../../documents/docs.github.com/Copilot%20docs%20CLI%20plugin%20reference.md)"
  - "[Copilot docs CLI config directory reference](../../documents/docs.github.com/Copilot%20docs%20CLI%20config%20directory%20reference.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[Plugin install](../../subjects/plugins/Plugin%20install.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The install command takes one specification. The plugin reference lists five formats for it.
