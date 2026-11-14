---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: plugins/install
  object:
    commands:
      - codex plugin add <PLUGIN>@<MARKETPLACE>
      - codex plugin add <PLUGIN> --marketplace <MARKETPLACE>
      - /plugins
    sources: plugins from a configured or remote marketplace
    recorded_in: the user config.toml in the Codex home folder, as plugins."<plugin>@<marketplace>" enabled = true; the files go to the plugin cache
    note: A new session is needed before the plugin's skills or tools can be used.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Codex CLI Plugin install help](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Plugin%20install%20help.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: help text of codex-cli 0.167.2.
  - hasEvidenceItems:
      - "[2026-11-14 Codex CLI Plugin install recorded source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Plugin%20install%20recorded%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source at rust-v0.167.2.
  - hasEvidenceItems:
      - "[2026-11-14 Codex CLI Plugin install docs](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Plugin%20install%20docs.md)"
      - "[2026-11-14 Codex CLI Plugin install config docs](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Plugin%20install%20config%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-14.
reportedIn:
  - "[openai codex core-plugins src manager.rs at ce21072](../../documents/github.com/openai%20codex%20core-plugins%20src%20manager.rs%20at%20ce21072.md)"
  - "[Codex docs plugins (redirect target of developers.openai.com codex plugins)](../../documents/learn.chatgpt.com/Codex%20docs%20plugins%20%28redirect%20target%20of%20developers.openai.com%20codex%20plugins%29.md)"
  - "[Codex docs build plugins](../../documents/developers.openai.com/Codex%20docs%20build%20plugins.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Plugin install](../../subjects/plugins/Plugin%20install.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

`/plugins` opens the plugin browser in an interactive session. The cache path is under Plugin install location.
