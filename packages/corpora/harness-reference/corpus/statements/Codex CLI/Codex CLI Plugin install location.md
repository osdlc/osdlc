---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: plugins/install-location
  object:
    path: ~/.codex/plugins/cache/$MARKETPLACE_NAME/$PLUGIN_NAME/$VERSION
    local_plugin_version: local
    uninstall: removes the plugin bundle from the environment
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Codex CLI Plugin install location](../../study-results/Codex%20CLI/2026-11-04%20Codex%20CLI%20Plugin%20install%20location.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 Codex CLI Plugin install location 2](../../study-results/Codex%20CLI/2026-11-04%20Codex%20CLI%20Plugin%20install%20location%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Codex docs build plugins](../../documents/developers.openai.com/Codex%20docs%20build%20plugins.md)"
  - "[Codex docs plugins (redirect target of developers.openai.com codex plugins)](../../documents/learn.chatgpt.com/Codex%20docs%20plugins%20%28redirect%20target%20of%20developers.openai.com%20codex%20plugins%29.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Plugin install location](../../subjects/plugins/Plugin%20install%20location.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:plugins/install-location@codex#scope-[null,null,null]
---

Imported from `facts/codex/plugins/install-location.md`.
