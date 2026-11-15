---
kind: docs
reportedIn:
  - "[Agent Plugins 1.0.0 plugin manifest schema](../../documents/github.com/Agent%20Plugins%201.0.0%20plugin%20manifest%20schema.md)"
harness: "[Agent Plugins](../../harnesses/Agent%20Plugins.md)"
observed: 2026-11-05
locator: schemas/1.0.0/plugin.schema.json:1-65 at ff8ab5e392cc87bd88d87c060815a87490e51003
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-fields@agent-plugins#observation-2
---

Imported from `facts/agent-plugins/plugins/manifest-fields.md`, observation 2.

- schema_required: ["$schema","name"]
- schema_closed: true
- schema_fields: ["$schema","name","version","description","author","author.name","author.email","author.url","homepage","repository","license","keywords","extensions"]

The schema matches the spec text. The spec says its text wins if the two conflict.
