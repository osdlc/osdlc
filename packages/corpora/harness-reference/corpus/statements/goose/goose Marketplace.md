---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: plugins/marketplace
  object:
    supported: false
    basis: omitted-from-help
    note: goose plugin has two commands, install <URL> and update <NAME>; a plugin installs straight from a git repository URL.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose cli plugin commands](../../study-results/goose/2026-11-14%20goose%20cli%20plugin%20commands.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The plugin command enum holds only install and update.
  - hasEvidenceItems:
      - "[2026-11-14 goose docs plugin install](../../study-results/goose/2026-11-14%20goose%20docs%20plugin%20install.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: weak
    description: The plugins guide installs a plugin from a git repository.
reportedIn:
  - "[aaif-goose goose cli.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli.rs%20at%202365bc5.md)"
  - "[aaif-goose goose plugins.md at 2365bc5](../../documents/github.com/aaif-goose%20goose%20plugins.md%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Marketplace](../../subjects/plugins/Marketplace.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

goose has no marketplace commands. A plugin is installed from a git repository URL.
