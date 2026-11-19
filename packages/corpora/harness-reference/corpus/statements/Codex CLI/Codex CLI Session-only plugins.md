---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: plugins/session-load
  object:
    supported: false
    persists: true
    note: codex plugin only adds, lists, removes and manages marketplaces; an installed plugin persists in the plugin cache.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Session-only plugins remove](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Session-only%20plugins%20remove.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "help-text observed 2026-11-09 at 0.162.0: an installed plugin lives in a local cache"
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Session-only plugins help](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Session-only%20plugins%20help.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "help-text observed 2026-11-09 at 0.162.0: the subcommands hold no load-for-one-session option (absence)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Session-only plugins](../../subjects/plugins/Session-only%20plugins.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
