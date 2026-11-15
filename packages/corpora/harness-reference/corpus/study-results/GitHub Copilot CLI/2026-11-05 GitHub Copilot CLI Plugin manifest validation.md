---
kind: docs
reportedIn:
  - "[GitHub Docs GitHub Copilot CLI plugin reference](../../documents/github.com/GitHub%20Docs%20GitHub%20Copilot%20CLI%20plugin%20reference.md)"
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
observed: 2026-11-05
locator: content/copilot/reference/copilot-cli-reference/cli-plugin-reference.md:123, 144, 355 at 17d6ee52f965e7c46f74b4339d5fa1ad6f4f4493
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-validation@copilot-cli#observation-1
---

Imported from `facts/copilot-cli/plugins/manifest-validation.md`, observation 1.

- unknown_fields: "warned"
- invalid_fields: "an Agent Plugins version the CLI does not support rejects the plugin; it contributes no components"
- schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"
- entry_strict: "a marketplace entry's strict (default true) applies the full schema and validation rules; false relaxes them"

unknown_fields covers Agent Plugins manifests: unknown top-level fields are reported and ignored. The 1.1.0 schema is also recognized.
