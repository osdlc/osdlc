---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: plugins/install
  object:
    commands:
      - goose plugin install <URL>
      - goose plugin install --auto-update <URL>
      - goose plugin update <NAME>
    sources: a git repository URL that holds an Open Plugins plugin or a Gemini extension
    recorded_in: .goose-plugin-install.json inside the installed plugin folder, under ~/.agents/plugins/<plugin-name>
    note: The repository is cloned, the format detected and the plugin copied in. A plugin folder copied by hand into the plugins directory is discovered too, but cannot be updated with goose plugin update.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose cli plugin commands](../../study-results/goose/2026-11-14%20goose%20cli%20plugin%20commands.md)"
      - "[2026-11-14 goose plugins git clone](../../study-results/goose/2026-11-14%20goose%20plugins%20git%20clone.md)"
      - "[2026-11-14 goose plugins install metadata file](../../study-results/goose/2026-11-14%20goose%20plugins%20install%20metadata%20file.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The plugin commands, the clone and the install metadata file.
  - hasEvidenceItems:
      - "[2026-11-14 goose docs plugin install](../../study-results/goose/2026-11-14%20goose%20docs%20plugin%20install.md)"
      - "[2026-11-14 goose docs plugin install steps](../../study-results/goose/2026-11-14%20goose%20docs%20plugin%20install%20steps.md)"
      - "[2026-11-14 goose docs user plugin location](../../study-results/goose/2026-11-14%20goose%20docs%20user%20plugin%20location.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The plugins guide describes the install command and where plugins live.
reportedIn:
  - "[aaif-goose goose cli.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli.rs%20at%202365bc5.md)"
  - "[aaif-goose goose plugins mod.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20plugins%20mod.rs%20at%202365bc5.md)"
  - "[aaif-goose goose plugins.md at 2365bc5](../../documents/github.com/aaif-goose%20goose%20plugins.md%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Plugin install](../../subjects/plugins/Plugin%20install.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

`goose plugin install <URL>` clones a git repository and copies the plugin into `~/.agents/plugins/<plugin-name>`.
