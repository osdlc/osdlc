---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: plugins/manifest-validation
  object:
    unknown_fields: warned in a root plugin.json (Agent Plugins format) and dropped; ignored silently in .codex-plugin/plugin.json; rejected inside the Agent Plugins author object
    invalid_fields: "a field that fails to parse, a null in a typed Agent Plugins field, a wrong $schema or a bad name: the manifest is not loaded, with a warning. A path or hooks value of the wrong shape, or a path that is not dot-slash relative or leaves the plugin root: that field is ignored, with a warning"
    schema: https://agent-plugins.org/schemas/1.0.0/plugin.schema.json
    marketplace_unknown_fields: top level ignored; in a plugin entry, kept as fallback manifest metadata
    marketplace_invalid_fields: a wrong type in a parsed field fails the whole marketplace file; an unsupported or unresolvable source, or an invalid plugin name, skips that entry with a warning
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-05 Codex CLI Plugin manifest validation](../../study-results/Codex%20CLI/2026-11-05%20Codex%20CLI%20Plugin%20manifest%20validation.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-05.
  - hasEvidenceItems:
      - "[2026-11-05 Codex CLI Plugin manifest validation 2](../../study-results/Codex%20CLI/2026-11-05%20Codex%20CLI%20Plugin%20manifest%20validation%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-05.
reportedIn:
  - "[openai codex core-plugins source at a037e65](../../documents/github.com/openai%20codex%20core-plugins%20source%20at%20a037e65.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Plugin manifest validation](../../subjects/plugins/Plugin%20manifest%20validation.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Does Codex ship a command that validates a plugin or marketplace manifest? The CLI's plugin and marketplace commands show no validate subcommand, and the docs name none.
imported_from: fact:plugins/manifest-validation@codex#scope-[null,null,null]
---

Imported from `facts/codex/plugins/manifest-validation.md`.

Open questions:
- Does Codex ship a command that validates a plugin or marketplace manifest? The CLI's plugin and marketplace commands show no validate subcommand, and the docs name none.
