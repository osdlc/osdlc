---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: plugins/manifest-validation
  object:
    unknown_fields: ignored
    invalid_fields: "install fails: a manifest that does not parse, a name outside 1-64 lowercase letters, digits, dashes and periods, a skills or mcpServers path that is not a string, does not start with dot-slash or leaves the plugin, a non-boolean exclusive, or an invalid MCP server document"
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-05 goose Plugin manifest validation](../../study-results/goose/2026-11-05%20goose%20Plugin%20manifest%20validation.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-05.
reportedIn:
  - "[block goose open_plugins.rs at 4facf56](../../documents/github.com/block%20goose%20open_plugins.rs%20at%204facf56.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Plugin manifest validation](../../subjects/plugins/Plugin%20manifest%20validation.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Does goose ship a validate command or a published JSON Schema for plugin.json? The plugin CLI has only install and update.
imported_from: fact:plugins/manifest-validation@goose#scope-[null,null,null]
---

Imported from `facts/goose/plugins/manifest-validation.md`.

Open questions:
- Does goose ship a validate command or a published JSON Schema for plugin.json? The plugin CLI has only install and update.
