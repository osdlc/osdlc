---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: plugins/install
  object:
    commands:
      - grok plugin install <source> --trust
      - grok plugin marketplace add <source>
    sources: "a marketplace plugin by name, owner/repo on GitHub, a git URL or a local path; @ref and #subdir suffixes"
    recorded_in: registry.json in ~/.grok/installed-plugins
    note: Without --trust the command shows the source and a warning, then stops. Plugins stay off until enabled.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok plugin install arg](../../study-results/Grok%20Build/2026-11-14%20grok%20plugin%20install%20arg.md)"
      - "[2026-11-14 grok plugin source forms](../../study-results/Grok%20Build/2026-11-14%20grok%20plugin%20source%20forms.md)"
      - "[2026-11-14 grok plugin registry file](../../study-results/Grok%20Build/2026-11-14%20grok%20plugin%20registry%20file.md)"
      - "[2026-11-14 grok plugin registry default dir](../../study-results/Grok%20Build/2026-11-14%20grok%20plugin%20registry%20default%20dir.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The install command argument, the source parser and the install registry.
  - hasEvidenceItems:
      - "[2026-11-14 grok plugin install by name](../../study-results/Grok%20Build/2026-11-14%20grok%20plugin%20install%20by%20name.md)"
      - "[2026-11-14 grok plugin install forms](../../study-results/Grok%20Build/2026-11-14%20grok%20plugin%20install%20forms.md)"
      - "[2026-11-14 grok plugin install forms 2](../../study-results/Grok%20Build/2026-11-14%20grok%20plugin%20install%20forms%202.md)"
      - "[2026-11-14 grok plugin install trust](../../study-results/Grok%20Build/2026-11-14%20grok%20plugin%20install%20trust.md)"
      - "[2026-11-14 grok marketplace add forms](../../study-results/Grok%20Build/2026-11-14%20grok%20marketplace%20add%20forms.md)"
      - "[2026-11-14 grok plugins off by default](../../study-results/Grok%20Build/2026-11-14%20grok%20plugins%20off%20by%20default.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The plugins guide.
reportedIn:
  - "[xai-org grok-build plugin_cmd.rs](../../documents/github.com/xai-org%20grok-build%20plugin_cmd.rs.md)"
  - "[xai-org grok-build plugins git_install.rs](../../documents/github.com/xai-org%20grok-build%20plugins%20git_install.rs.md)"
  - "[xai-org grok-build plugins install_registry.rs](../../documents/github.com/xai-org%20grok-build%20plugins%20install_registry.rs.md)"
  - "[Grok Build user guide Plugins](../../documents/github.com/Grok%20Build%20user%20guide%20Plugins.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Plugin install](../../subjects/plugins/Plugin%20install.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
