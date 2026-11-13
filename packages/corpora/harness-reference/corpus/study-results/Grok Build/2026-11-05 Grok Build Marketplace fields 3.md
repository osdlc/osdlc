---
kind: source
reportedIn:
  - "[xai-org grok-build plugin-marketplace catalog.rs](../../documents/github.com/xai-org%20grok-build%20plugin-marketplace%20catalog.rs.md)"
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
observed: 2026-11-05
locator: crates/codegen/xai-grok-plugin-marketplace/src/catalog.rs:1-32, 58-98 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/marketplace-fields@grok-build#observation-3
---

Imported from `facts/grok-build/plugins/marketplace-fields.md`, observation 3.

- catalog_file: ".grok-plugin/plugin-index.json"
- catalog_fields: [{"name":"version","type":"integer","required":true,"use":"catalog format version; only 1 is read"},{"name":"plugins","type":"object","required":false,"use":"map from index plugin name to its entry"},{"name":"plugins.<name>.sha","type":"string","required":"conditional","use":"commit the components came from","note":"Required for URL-sourced entries; must match the index sha or the components are hidden."},{"name":"plugins.<name>.components","type":"object","required":true,"use":"skills, commands, hooks and agents shown in the browser before install"}]

An optional display-only catalog next to marketplace.json; .claude-plugin/plugin-index.json is the fallback.
