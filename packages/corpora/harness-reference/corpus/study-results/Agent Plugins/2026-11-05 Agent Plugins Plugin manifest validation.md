---
kind: docs
reportedIn:
  - "[Agent Plugins Specification 1.0.0](../../documents/github.com/Agent%20Plugins%20Specification%201.0.0.md)"
harness: "[Agent Plugins](../../harnesses/Agent%20Plugins.md)"
observed: 2026-11-05
locator: spec/1.0.0.md:141-151, 189-212, 427, 543-550 at ff8ab5e392cc87bd88d87c060815a87490e51003
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-validation@agent-plugins#observation-1
---

Imported from `facts/agent-plugins/plugins/manifest-validation.md`, observation 1.

- unknown_fields: "warned"
- invalid_fields: "any other schema violation is fatal: the client rejects the plugin and discovers none of its components"
- invalid_extensions: "a non-object extensions field is reported and ignored; loading continues"
- unsupported_schema_version: "the client rejects the plugin and should report the version"
- schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"

unknown_fields: clients MUST report and ignore each unknown top-level field and keep loading. Clients must not fetch the schema while loading; $schema only selects local rules. Format checks on version, URLs, email and license are forbidden as grounds for rejection.
