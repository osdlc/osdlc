---
proposition:
  subject: "[Agent Plugins](../../harnesses/Agent%20Plugins.md)"
  predicate: plugins/manifest-validation
  object:
    unknown_fields: warned
    invalid_fields: "any other schema violation is fatal: the client rejects the plugin and discovers none of its components"
    invalid_extensions: a non-object extensions field is reported and ignored; loading continues
    unsupported_schema_version: the client rejects the plugin and should report the version
    schema: https://agent-plugins.org/schemas/1.0.0/plugin.schema.json
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-05 Agent Plugins Plugin manifest validation](../../study-results/Agent%20Plugins/2026-11-05%20Agent%20Plugins%20Plugin%20manifest%20validation.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-05.
reportedIn:
  - "[Agent Plugins Specification 1.0.0](../../documents/github.com/Agent%20Plugins%20Specification%201.0.0.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
harness: "[Agent Plugins](../../harnesses/Agent%20Plugins.md)"
subject: "[Plugin manifest validation](../../subjects/plugins/Plugin%20manifest%20validation.md)"
scope:
  since: 1.0.0
  until: null
  platform: []
  model: null
status: current
open:
  - Does the project ship a validator command or library, beyond the JSON Schemas? The spec and site name none.
imported_from: fact:plugins/manifest-validation@agent-plugins#scope-["1.0.0",null,null]
---

Imported from `facts/agent-plugins/plugins/manifest-validation.md`.

Open questions:
- Does the project ship a validator command or library, beyond the JSON Schemas? The spec and site name none.
