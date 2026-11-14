---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: plugins/upgrade-retention
  object:
    old_versions_kept: false
    mechanism: the new version folder is moved into the plugin's cache folder, then every other version folder there is removed
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Codex CLI Old plugin versions activate source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Old%20plugin%20versions%20activate%20source.md)"
      - "[2026-11-14 Codex CLI Old plugin versions removal source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Old%20plugin%20versions%20removal%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source at rust-v0.167.2.
reportedIn:
  - "[openai codex core-plugins src store.rs at ce21072](../../documents/github.com/openai%20codex%20core-plugins%20src%20store.rs%20at%20ce21072.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Old plugin versions](../../subjects/plugins/Old%20plugin%20versions.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Installing a version that is not yet in the cache renames the staged copy into place and then deletes the other version folders. Installing the same version again swaps the whole plugin folder.
