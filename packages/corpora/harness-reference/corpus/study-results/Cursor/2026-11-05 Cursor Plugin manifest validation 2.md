---
kind: source
reportedIn:
  - "[cursor plugins validate-plugins.mjs](../../documents/github.com/cursor%20plugins%20validate-plugins.mjs.md)"
harness: "[Cursor](../../harnesses/Cursor.md)"
observed: 2026-11-05
locator: scripts/validate-plugins.mjs:16-25, 76-81; schemas/plugin.schema.json:8; schemas/marketplace.schema.json:8, 57 at 2776ddd2355d6d6c8747d3964600f28daf62f049
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-validation@cursor#observation-2
---

Imported from `facts/cursor/plugins/manifest-validation.md`, observation 2.

- schema_validator: "node scripts/validate-plugins.mjs (Ajv) in the cursor/plugins repository CI"
- schema_unknown_fields: "rejected"
- schema: "https://github.com/cursor/plugins/blob/2776ddd2355d6d6c8747d3964600f28daf62f049/schemas/plugin.schema.json"
- marketplace_schema: "https://github.com/cursor/plugins/blob/2776ddd2355d6d6c8747d3964600f28daf62f049/schemas/marketplace.schema.json"

Both schemas set additionalProperties false, so an unknown field fails this CI check. It checks the official marketplace repository, not the client.
