---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: plugins/marketplace-git-ref
  object:
    supported: true
    ref_syntax: owner/repo@ref or <git url>@ref, on plugin install
    kinds:
      - branch
      - tag
      - commit
    argv:
      - plugin
      - install
      - "{source}@{ref}"
    subpath: "#subdir after the source"
    note: A marketplace source in config.toml takes an optional branch. The docs show grok plugin marketplace add with no ref.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok plugin source forms](../../study-results/Grok%20Build/2026-11-14%20grok%20plugin%20source%20forms.md)"
      - "[2026-11-14 grok plugin install arg](../../study-results/Grok%20Build/2026-11-14%20grok%20plugin%20install%20arg.md)"
      - "[2026-11-14 grok plugin update pinned](../../study-results/Grok%20Build/2026-11-14%20grok%20plugin%20update%20pinned.md)"
      - "[2026-11-14 grok plugin branch ref test](../../study-results/Grok%20Build/2026-11-14%20grok%20plugin%20branch%20ref%20test.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The install source parser and the update rule for branch, tag and commit installs.
  - hasEvidenceItems:
      - "[2026-11-14 grok plugin install forms](../../study-results/Grok%20Build/2026-11-14%20grok%20plugin%20install%20forms.md)"
      - "[2026-11-14 grok marketplace source branch](../../study-results/Grok%20Build/2026-11-14%20grok%20marketplace%20source%20branch.md)"
      - "[2026-11-14 grok marketplace add forms](../../study-results/Grok%20Build/2026-11-14%20grok%20marketplace%20add%20forms.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The plugins guide.
reportedIn:
  - "[xai-org grok-build plugins git_install.rs](../../documents/github.com/xai-org%20grok-build%20plugins%20git_install.rs.md)"
  - "[xai-org grok-build plugin_cmd.rs](../../documents/github.com/xai-org%20grok-build%20plugin_cmd.rs.md)"
  - "[Grok Build user guide Plugins](../../documents/github.com/Grok%20Build%20user%20guide%20Plugins.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Marketplace git ref](../../subjects/plugins/Marketplace%20git%20ref.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
