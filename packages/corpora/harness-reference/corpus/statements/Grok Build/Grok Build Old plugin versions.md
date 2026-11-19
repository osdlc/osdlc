---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: plugins/upgrade-retention
  object:
    old_versions_kept: false
    mechanism: one install directory per source under ~/.grok/installed-plugins; a git install updates in place with git pull --ff-only, and a marketplace update swaps in a staged copy and removes the backup of the old one
    update: grok plugin update [<name>]; tag and commit installs are pinned and left as they are
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok plugin install dir key](../../study-results/Grok%20Build/2026-11-14%20grok%20plugin%20install%20dir%20key.md)"
      - "[2026-11-14 grok plugin install snapshot](../../study-results/Grok%20Build/2026-11-14%20grok%20plugin%20install%20snapshot.md)"
      - "[2026-11-14 grok plugin update pinned](../../study-results/Grok%20Build/2026-11-14%20grok%20plugin%20update%20pinned.md)"
      - "[2026-11-14 grok plugin update pull](../../study-results/Grok%20Build/2026-11-14%20grok%20plugin%20update%20pull.md)"
      - "[2026-11-14 grok marketplace update swap](../../study-results/Grok%20Build/2026-11-14%20grok%20marketplace%20update%20swap.md)"
      - "[2026-11-14 grok marketplace update removes backup](../../study-results/Grok%20Build/2026-11-14%20grok%20marketplace%20update%20removes%20backup.md)"
      - "[2026-11-14 grok plugin registry default dir](../../study-results/Grok%20Build/2026-11-14%20grok%20plugin%20registry%20default%20dir.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The install directory is keyed by source, not by version; the git update pulls in place; the marketplace update renames the old copy to a backup and removes it after the swap.
  - hasEvidenceItems:
      - "[2026-11-14 grok plugin update command](../../study-results/Grok%20Build/2026-11-14%20grok%20plugin%20update%20command.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The plugins guide names the update command.
reportedIn:
  - "[xai-org grok-build plugins git_install.rs](../../documents/github.com/xai-org%20grok-build%20plugins%20git_install.rs.md)"
  - "[xai-org grok-build plugin-marketplace installer.rs](../../documents/github.com/xai-org%20grok-build%20plugin-marketplace%20installer.rs.md)"
  - "[xai-org grok-build plugins install_registry.rs](../../documents/github.com/xai-org%20grok-build%20plugins%20install_registry.rs.md)"
  - "[Grok Build user guide Plugins](../../documents/github.com/Grok%20Build%20user%20guide%20Plugins.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Old plugin versions](../../subjects/plugins/Old%20plugin%20versions.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[Grok Build Old plugin versions open](Grok%20Build%20Old%20plugin%20versions%20open.md)"
---

Read from the installer source. No run was made.
