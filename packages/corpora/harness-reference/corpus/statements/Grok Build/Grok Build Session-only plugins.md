---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: plugins/session-load
  object:
    supported: partial
    load_argv:
      - agent
      - --plugin-dir
      - "{dir}"
      - stdio
    repeatable: true
    persists: false
    note: --plugin-dir is a flag of `grok agent` (the ACP agent process), not of the TUI or `grok -p`, and is ignored in leader mode. An ACP client can pass _meta.pluginDirs on session/new or session/load for one session. Both are trusted automatically.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok cli plugin-dir flag](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20plugin-dir%20flag.md)"
      - "[2026-11-14 grok cli plugin-dir flag 2](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20plugin-dir%20flag%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The --plugin-dir argument of the agent subcommand.
  - hasEvidenceItems:
      - "[2026-11-14 grok plugin-dir flag doc](../../study-results/Grok%20Build/2026-11-14%20grok%20plugin-dir%20flag%20doc.md)"
      - "[2026-11-14 grok pluginDirs meta](../../study-results/Grok%20Build/2026-11-14%20grok%20pluginDirs%20meta.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The plugins guide.
reportedIn:
  - "[xai-org grok-build pager cli.rs](../../documents/github.com/xai-org%20grok-build%20pager%20cli.rs.md)"
  - "[Grok Build user guide Plugins](../../documents/github.com/Grok%20Build%20user%20guide%20Plugins.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Session-only plugins](../../subjects/plugins/Session-only%20plugins.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Partial because the flag belongs to the agent subcommand only.
