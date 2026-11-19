---
kind: source
reportedIn:
  - "[xai-org grok-build plugin-marketplace index.rs](../../documents/github.com/xai-org%20grok-build%20plugin-marketplace%20index.rs.md)"
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
observed: 2026-11-05
locator: crates/codegen/xai-grok-plugin-marketplace/src/index.rs:1-147, 187-217 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/marketplace-fields@grok-build#observation-1
---

Imported from `facts/grok-build/plugins/marketplace-fields.md`, observation 1.

- file: ".grok-plugin/marketplace.json"
- files_checked: [".grok-plugin/marketplace.json",".grok-plugin/plugin.json",".claude-plugin/marketplace.json",".claude-plugin/plugin.json"]
- fields: [{"name":"name","type":"string","required":true,"use":"marketplace display name"},{"name":"description","type":"string","required":false,"use":"not documented"},{"name":"owner","type":"object","required":false,"use":"not documented"},{"name":"owner.name","type":"string","required":"conditional","use":"not documented","note":"Required when owner is set."},{"name":"owner.email","type":"string","required":false,"use":"not documented"},{"name":"plugins","type":"array","required":false,"use":"plugin entries; defaults to empty"}]
- entry_fields: [{"name":"name","type":"string","required":true,"use":"plugin name"},{"name":"version","type":"string","required":false,"use":"version from index metadata"},{"name":"description","type":"string","required":false,"use":"not documented"},{"name":"category","type":"string","required":false,"use":"category, such as development, productivity or design"},{"name":"author","type":"object","required":false,"use":"not documented"},{"name":"author.name","type":"string","required":"conditional","use":"not documented","note":"Required when author is set."},{"name":"source","type":"string | object","required":false,"use":"plugin location; a plugin without one has no resolvable path"},{"name":"homepage","type":"string","required":false,"use":"not documented"},{"name":"tags","type":"string[]","required":false,"use":"not documented"},{"name":"keywords","type":"string[]","required":false,"use":"matcher keywords that tie the plugin to a user request"},{"name":"domains","type":"string[]","required":false,"use":"matcher domains that tie the plugin to a user request"}]
- source_forms: ["relative path (string)","local (type or source, path)","url (type or source, url, ref, sha, path)"]

files_checked is the search order. A source object's kind is read from type, or from source when type is absent; its other keys are ignored. path on a url source is the subdirectory.
