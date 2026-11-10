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
imported_from: fact:plugins/manifest-fields@antigravity#observation-1
---

Imported from `facts/antigravity/plugins/manifest-fields.md`, observation 1.

- file: "plugin.json"
- also_read: ".antigravity-plugin/plugin.json"
- fields: [{"name":"$schema","type":"string","required":false,"use":"schema URL for editor autocomplete and validation"},{"name":"name","type":"string","required":"conditional","use":"machine name; letters, digits, hyphens and underscores; namespaces bundled MCP servers","note":"agy plugin install requires it; a plugin loaded from a folder without a name is named after the folder."},{"name":"displayName","type":"string","required":false,"use":"name shown in the plugin list instead of name"},{"name":"display_name","type":"string","required":false,"use":"alias of displayName; displayName wins"},{"name":"description","type":"string","required":false,"use":"short description in the plugin list"},{"name":"version","type":"string","required":false,"use":"version shown with the plugin; any string"},{"name":"disabled","type":"boolean","required":false,"use":"plugin starts disabled; default false; the user's choice wins"},{"name":"logo","type":"string","required":false,"use":"plugin icon: a relative image path inside the plugin, or an https URL on a Google domain; other values ignored"},{"name":"suggestedPrompts","type":"string[]","required":false,"use":"up to three example prompts"},{"name":"suggested_prompts","type":"string[]","required":false,"use":"alias of suggestedPrompts, used only when that is empty"},{"name":"skills","type":"string | string[]","required":false,"use":"extra skill folders loaded in addition to skills"},{"name":"author","type":"string | object","required":false,"use":"plugin author"},{"name":"author.name","type":"string","required":false,"use":"not documented"},{"name":"author.email","type":"string","required":false,"use":"not documented"},{"name":"author.url","type":"string","required":false,"use":"not documented"},{"name":"homepage","type":"string","required":false,"use":"homepage or documentation URL"},{"name":"repository","type":"string","required":false,"use":"source repository URL"},{"name":"license","type":"string","required":false,"use":"license, such as Apache-2.0"},{"name":"keywords","type":"string[]","required":false,"use":"search keywords"},{"name":"extensions","type":"object","required":false,"use":"client-specific settings keyed by namespace; each value an object"},{"name":"source","type":"string","required":false,"use":"deprecated; set by older plugin imports"},{"name":"sourcePath","type":"string","required":false,"use":"deprecated; set by older plugin imports"},{"name":"source_path","type":"string","required":false,"use":"deprecated alias of sourcePath"}]
- not_in_manifest: "MCP servers (mcp_config.json), hooks (hooks.json), agents and rules are found by fixed path, not declared"
