---
kind: source
reportedIn:
  - "[QwenLM qwen-code agent-plugins-v1 manifest.ts at 1bac51b](../../documents/github.com/QwenLM%20qwen-code%20agent-plugins-v1%20manifest.ts%20at%201bac51b.md)"
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
observed: 2026-11-05
locator: packages/core/src/extension/agent-plugins-v1/manifest.ts:19-31, 75-150 at 1bac51b7d9e28d5c0f7d9a0a6fcd3add14443ebb
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-fields@qwen-code#observation-3
---

Imported from `facts/qwen-code/plugins/manifest-fields.md`, observation 3.

- agent_plugin_file: "plugin.json"
- agent_plugin_fields: [{"name":"$schema","type":"string","required":true,"use":"must equal the Agent Plugins 1.0.0 schema URI"},{"name":"name","type":"string","required":true,"use":"id and display name; 1-64 lowercase letters, digits, dots or hyphens"},{"name":"version","type":"string","required":false,"use":"version; default 1.0.0"},{"name":"description","type":"string","required":false,"use":"description"},{"name":"author","type":"object","required":false,"use":"checked for type; keys name, email, url"},{"name":"homepage","type":"string","required":false,"use":"checked for type"},{"name":"repository","type":"string","required":false,"use":"checked for type"},{"name":"license","type":"string","required":false,"use":"checked for type"},{"name":"keywords","type":"string[]","required":false,"use":"checked for type"},{"name":"extensions","type":"object","required":false,"use":"accepted; a non-object is ignored with a warning"}]
