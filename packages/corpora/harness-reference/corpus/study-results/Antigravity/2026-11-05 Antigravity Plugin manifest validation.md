---
kind: docs
reportedIn:
  - "[Antigravity plugin manifest JSON Schema (v1)](../../documents/antigravity.google/Antigravity%20plugin%20manifest%20JSON%20Schema%20%28v1%29.md)"
harness: "[Antigravity](../../harnesses/Antigravity.md)"
observed: 2026-11-05
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-validation@antigravity#observation-1
---

Imported from `facts/antigravity/plugins/manifest-validation.md`, observation 1.

- unknown_fields: "ignored at load; reported by agy plugin validate"
- invalid_fields: "plugin not loaded"
- validator: "agy plugin validate [--strict] <path>"
- validator_strict: "treats warnings as errors"
- schema: "https://antigravity.google/schemas/v1/plugin.json"

The hosted schema sets additionalProperties false, which a schema validator would reject, while its own description says the harness ignores unknown keys.
