---
kind: source
reportedIn:
  - "[QwenLM qwen-code extensionManager.ts at 1bac51b](../../documents/github.com/QwenLM%20qwen-code%20extensionManager.ts%20at%201bac51b.md)"
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
observed: 2026-11-05
locator: packages/core/src/extension/extensionManager.ts:161-168, 201-222, 2128-2178, 3702-3708; extensionSettings.ts:146-152 at 1bac51b7d9e28d5c0f7d9a0a6fcd3add14443ebb
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-fields@qwen-code#observation-1
---

Imported from `facts/qwen-code/plugins/manifest-fields.md`, observation 1.

- file: "qwen-extension.json"
- fields: [{"name":"name","type":"string","required":true,"use":"extension id; letters, digits, underscores, dots and dashes"},{"name":"version","type":"string","required":false,"use":"extension version","note":"Typed as a required string, but the loader checks only name."},{"name":"displayName","type":"string | Record<string, string>","required":false,"use":"display name; a map is resolved by locale"},{"name":"description","type":"string | Record<string, string>","required":false,"use":"description; a map is resolved by locale"},{"name":"mcpServers","type":"Record<string, MCPServerConfig>","required":false,"use":"MCP servers loaded at startup; settings.json wins on a name clash"},{"name":"lspServers","type":"string | object","required":false,"use":"not documented"},{"name":"contextFileName","type":"string | string[]","required":false,"use":"context files; default QWEN.md"},{"name":"commands","type":"string | string[]","required":false,"use":"command directory; default commands"},{"name":"skills","type":"string | string[]","required":false,"use":"skill directory; default skills"},{"name":"skillStates","type":"Record<string, boolean>","required":false,"use":"not documented"},{"name":"agents","type":"string | string[]","required":false,"use":"subagent directory; default agents"},{"name":"workflows","type":"string | string[]","required":false,"use":"workflow directories or .js files; default workflows"},{"name":"settings","type":"ExtensionSetting[]","required":false,"use":"values asked for at install, passed to MCP servers as environment variables"},{"name":"settings.name","type":"string","required":true,"use":"setting display name"},{"name":"settings.description","type":"string","required":true,"use":"what the setting is for"},{"name":"settings.envVar","type":"string","required":true,"use":"environment variable that is set"},{"name":"settings.sensitive","type":"boolean","required":false,"use":"hide the value"},{"name":"hooks","type":"object keyed by hook event","required":false,"use":"inline hook definitions"},{"name":"channels","type":"Record<string, ExtensionChannelConfig>","required":false,"use":"custom channel adapters keyed by channel type"},{"name":"channels.entry","type":"string","required":true,"use":"JS entry that exports a ChannelPlugin"},{"name":"channels.displayName","type":"string","required":false,"use":"name in CLI output"},{"name":"channels.requiredConfigFields","type":"string[]","required":false,"use":"extra config fields the channel needs"}]
- also_loaded: "a root plugin.json that declares the Agent Plugins schema is loaded natively; .claude-plugin/plugin.json, gemini-extension.json and .qoder-plugin/plugin.json are converted to qwen-extension.json on install"
