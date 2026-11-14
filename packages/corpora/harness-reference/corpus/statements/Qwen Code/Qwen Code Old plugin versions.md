---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: plugins/upgrade-retention
  object:
    old_versions_kept: false
    mechanism: the installed directory is renamed to a backup, the new copy is moved into place, and the backup is removed once the change is committed
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Extension swap source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Extension%20swap%20source.md)"
      - "[2026-11-14 Qwen Code Extension backup removal source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Extension%20backup%20removal%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at v0.27.3: the extension store's swap transaction and its teardown"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[Old plugin versions](../../subjects/plugins/Old%20plugin%20versions.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Read from the extension store source, not run. The store replaces the installed directory in one transaction and removes the backup of the old copy afterwards. If that cleanup fails, the store retries it on its next operation.
