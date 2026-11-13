---
kind: docs
reportedIn:
  - "[Antigravity docs Build plugins antigravity.google](../../documents/antigravity.google/Antigravity%20docs%20Build%20plugins%20antigravity.google.md)"
harness: "[Antigravity](../../harnesses/Antigravity.md)"
observed: 2026-11-05
locator: Manifest file (plugin.json), Field reference
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-fields@antigravity#observation-2
---

Imported from `facts/antigravity/plugins/manifest-fields.md`, observation 2.

- docs_required_for_marketplace: ["name","displayName","description","version","logo","author"]
- docs_publish_checklist: ["name","displayName","description","version","logo","suggestedPrompts","author"]
- docs_name_pattern: "^[a-z0-9]+(-[a-z0-9]+)*$"
- precedence: ".antigravity-plugin/plugin.json wins over a root plugin.json"

The field table marks suggestedPrompts Recommended; the Publish section's checklist lists it among the plugin.json contents. The page's own copy of the schema is older than the hosted one: it lacks display_name, suggested_prompts, source, sourcePath and source_path, and gives the stricter kebab-case name pattern.
