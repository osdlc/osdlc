---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: plugins/upgrade-retention
  object:
    old_versions_kept: true
    mechanism: an update installs a new timestamped generation directory under npm/<package key> in the cache
    retention: the two newest generations are kept; older ones are removed once more than 7 days old
    update: opencode plugin update [target]; exact npm versions and full git commit hashes stay pinned
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode npm cache directory source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20npm%20cache%20directory%20source%20v2.3.0.md)"
      - "[2026-11-14 OpenCode npm generation directory source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20npm%20generation%20directory%20source%20v2.3.0.md)"
      - "[2026-11-14 OpenCode npm generation collect source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20npm%20generation%20collect%20source%20v2.3.0.md)"
      - "[2026-11-14 OpenCode npm generation retention source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20npm%20generation%20retention%20source%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The npm installer writes each install to a new generation directory, and after an update removes generations other than the newest two once they pass the 7 day retention.
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode plugins docs pinned v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20plugins%20docs%20pinned%20v2.3.0.md)"
      - "[2026-11-14 OpenCode plugins docs manage v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20plugins%20docs%20manage%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The plugins page describes plugin update and says exact versions and full commit hashes stay pinned.
reportedIn:
  - "[OpenCode source util npm.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20util%20npm.ts%20at%20a6b15d3.md)"
  - "[OpenCode docs source plugins at a6b15d3](../../documents/github.com/OpenCode%20docs%20source%20plugins%20at%20a6b15d3.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Old plugin versions](../../subjects/plugins/Old%20plugin%20versions.md)"
scope:
  since: 2.3.0
  until: null
  platform: []
  model: null
status: current
---

Read from `packages/util/src/npm.ts` at v2.3.0. This covers package plugins; a local plugin directory is loaded in place.
