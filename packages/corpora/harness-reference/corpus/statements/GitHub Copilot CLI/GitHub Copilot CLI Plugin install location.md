---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: plugins/install-location
  object:
    marketplace: ~/.copilot/installed-plugins/MARKETPLACE/PLUGIN-NAME
    direct: ~/.copilot/installed-plugins/_direct/SOURCE-ID
    layout: marketplace installs under installed-plugins/{marketplace-name}/{plugin-name}/; direct under installed-plugins/_direct/
    local_marketplace_plugins: path-sourced plugins in a local directory marketplace load live from their real directory
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 GitHub Copilot CLI Plugin install location](../../study-results/GitHub%20Copilot%20CLI/2026-11-04%20GitHub%20Copilot%20CLI%20Plugin%20install%20location.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 GitHub Copilot CLI Plugin install location 2](../../study-results/GitHub%20Copilot%20CLI/2026-11-04%20GitHub%20Copilot%20CLI%20Plugin%20install%20location%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 GitHub Copilot CLI Plugin install location 3](../../study-results/GitHub%20Copilot%20CLI/2026-11-04%20GitHub%20Copilot%20CLI%20Plugin%20install%20location%203.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Copilot docs CLI plugin reference](../../documents/docs.github.com/Copilot%20docs%20CLI%20plugin%20reference.md)"
  - "[Copilot docs CLI config directory reference](../../documents/docs.github.com/Copilot%20docs%20CLI%20config%20directory%20reference.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[Plugin install location](../../subjects/plugins/Plugin%20install%20location.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:plugins/install-location@copilot-cli#scope-[null,null,null]
---

Imported from `facts/copilot-cli/plugins/install-location.md`.
