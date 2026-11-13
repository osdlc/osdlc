---
kind: source
reportedIn:
  - "[cursor plugin-template validate-template.mjs](../../documents/github.com/cursor%20plugin-template%20validate-template.mjs.md)"
harness: "[Cursor](../../harnesses/Cursor.md)"
observed: 2026-11-05
locator: scripts/validate-template.mjs:250-344 at 46216072ac5750f782f95bb325b4d12b7c3ae9c9
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-validation@cursor#observation-1
---

Imported from `facts/cursor/plugins/manifest-validation.md`, observation 1.

- validator: "node scripts/validate-template.mjs in the cursor/plugin-template repository"
- checks: "marketplace name and owner.name, non-empty plugins, safe relative sources and pluginRoot, plugin names, entry name equal to plugin.json name, referenced paths exist, component frontmatter"
- unknown_fields: "not checked"
