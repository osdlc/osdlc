---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: plugins/manifest-validation
  object:
    validator: node scripts/validate-template.mjs in the cursor/plugin-template repository
    checks: marketplace name and owner.name, non-empty plugins, safe relative sources and pluginRoot, plugin names, entry name equal to plugin.json name, referenced paths exist, component frontmatter
    unknown_fields: not checked
    schema_validator: node scripts/validate-plugins.mjs (Ajv) in the cursor/plugins repository CI
    schema_unknown_fields: rejected
    schema: https://github.com/cursor/plugins/blob/2776ddd2355d6d6c8747d3964600f28daf62f049/schemas/plugin.schema.json
    marketplace_schema: https://github.com/cursor/plugins/blob/2776ddd2355d6d6c8747d3964600f28daf62f049/schemas/marketplace.schema.json
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-05 Cursor Plugin manifest validation](../../study-results/Cursor/2026-11-05%20Cursor%20Plugin%20manifest%20validation.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-05.
  - hasEvidenceItems:
      - "[2026-11-05 Cursor Plugin manifest validation 2](../../study-results/Cursor/2026-11-05%20Cursor%20Plugin%20manifest%20validation%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-05.
reportedIn:
  - "[cursor plugin-template validate-template.mjs](../../documents/github.com/cursor%20plugin-template%20validate-template.mjs.md)"
  - "[cursor plugins validate-plugins.mjs](../../documents/github.com/cursor%20plugins%20validate-plugins.mjs.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Plugin manifest validation](../../subjects/plugins/Plugin%20manifest%20validation.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - What does the Cursor client do with an unknown or wrongly typed field in .cursor-plugin/plugin.json or marketplace.json? The docs do not say.
  - Does Cursor ship a validate command of its own? The docs' submission checklist asks for a valid manifest but names no tool.
imported_from: fact:plugins/manifest-validation@cursor#scope-[null,null,null]
---

Imported from `facts/cursor/plugins/manifest-validation.md`.

Open questions:
- What does the Cursor client do with an unknown or wrongly typed field in .cursor-plugin/plugin.json or marketplace.json? The docs do not say.
- Does Cursor ship a validate command of its own? The docs' submission checklist asks for a valid manifest but names no tool.
