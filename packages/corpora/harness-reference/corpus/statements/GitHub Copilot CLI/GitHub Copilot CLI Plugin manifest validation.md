---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: plugins/manifest-validation
  object:
    unknown_fields: warned
    invalid_fields: an Agent Plugins version the CLI does not support rejects the plugin; it contributes no components
    schema: https://agent-plugins.org/schemas/1.0.0/plugin.schema.json
    entry_strict: a marketplace entry's strict (default true) applies the full schema and validation rules; false relaxes them
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-05 GitHub Copilot CLI Plugin manifest validation](../../study-results/GitHub%20Copilot%20CLI/2026-11-05%20GitHub%20Copilot%20CLI%20Plugin%20manifest%20validation.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-05.
reportedIn:
  - "[GitHub Docs GitHub Copilot CLI plugin reference](../../documents/github.com/GitHub%20Docs%20GitHub%20Copilot%20CLI%20plugin%20reference.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[Plugin manifest validation](../../subjects/plugins/Plugin%20manifest%20validation.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - What does Copilot CLI do with an unknown or wrongly typed field in a legacy plugin.json or in marketplace.json? The docs answer only for Agent Plugins manifests.
  - Does Copilot CLI have a command that validates a manifest? The plugin command table lists none.
imported_from: fact:plugins/manifest-validation@copilot-cli#scope-[null,null,null]
---

Imported from `facts/copilot-cli/plugins/manifest-validation.md`.

Open questions:
- What does Copilot CLI do with an unknown or wrongly typed field in a legacy plugin.json or in marketplace.json? The docs answer only for Agent Plugins manifests.
- Does Copilot CLI have a command that validates a manifest? The plugin command table lists none.
