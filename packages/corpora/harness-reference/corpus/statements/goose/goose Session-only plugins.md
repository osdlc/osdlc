---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: plugins/session-load
  object:
    supported: false
    disable_via: disabledPlugins in ~/.config/goose/settings.json, or in .config/goose/settings.json or settings.local.json of the project
    basis: omitted-from-help
    note: goose run and goose session have no flag that loads a plugin folder. A plugin placed in .agents/plugins of a project is discovered for that project.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose cli run option groups](../../study-results/goose/2026-11-14%20goose%20cli%20run%20option%20groups.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The option groups of goose run hold no plugin flag.
  - hasEvidenceItems:
      - "[2026-11-14 goose docs plugin disable](../../study-results/goose/2026-11-14%20goose%20docs%20plugin%20disable.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The plugins guide disables a plugin through disabledPlugins in a settings file.
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
subject: "[Session-only plugins](../../subjects/plugins/Session-only%20plugins.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

No flag loads a plugin for one session. An installed plugin is switched off through `disabledPlugins` in a settings file.
