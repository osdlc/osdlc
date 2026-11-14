---
kind: inferred
reportedIn:
  - "[Amp docs Plugins](../../documents/ampcode.com/Amp%20docs%20Plugins.md)"
harness: "[Amp](../../harnesses/Amp.md)"
observed: 2026-11-05
locator: Writing Plugins; Bundle a Skill
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-fields@amp#observation-1
---

Imported from `facts/amp/plugins/manifest-fields.md`, observation 1.

- applicable: false
- plugin_form: "a .ts or .js file, or a directory with index.ts or index.js, whose default export receives the PluginAPI"

The docs describe a plugin as code with an entry file and name no manifest file. Skills inside a plugin are registered from code, not declared.
