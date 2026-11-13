---
kind: source
reportedIn:
  - "[google-gemini gemini-cli config source at 3fd7d26](../../documents/github.com/google-gemini%20gemini-cli%20config%20source%20at%203fd7d26.md)"
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
observed: 2026-11-05
locator: packages/cli/src/config/extension.ts:24-49; packages/cli/src/config/extensions/extensionSettings.ts:24-30; packages/cli/src/config/extension-manager.ts:1087-1122 at 3fd7d263466b9e5d30b2da1ebf85dae956a0fb86
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-fields@gemini-cli#observation-1
---

Imported from `facts/gemini-cli/plugins/manifest-fields.md`, observation 1.

- file: "gemini-extension.json"
- fields: [{"name":"name","type":"string","required":true,"use":"extension id; letters, digits and dashes only; used in the CLI and for command conflicts"},{"name":"version","type":"string","required":true,"use":"extension version; checked on update"},{"name":"mcpServers","type":"Record<string, MCPServerConfig>","required":false,"use":"MCP servers loaded at startup; settings.json wins on a name clash"},{"name":"contextFileName","type":"string | string[]","required":false,"use":"context files loaded from the extension directory; default GEMINI.md"},{"name":"excludeTools","type":"string[]","required":false,"use":"tool names, or tool(command) patterns, hidden from the model"},{"name":"settings","type":"ExtensionSetting[]","required":false,"use":"values asked for at install and stored in the extension's .env"},{"name":"settings.name","type":"string","required":true,"use":"setting display name"},{"name":"settings.description","type":"string","required":true,"use":"setting explanation"},{"name":"settings.envVar","type":"string","required":true,"use":"environment variable that holds the value; allowlisted for the extension"},{"name":"settings.sensitive","type":"boolean","required":false,"use":"store in the system keychain and obfuscate in the UI"},{"name":"themes","type":"CustomTheme[]","required":false,"use":"custom themes registered when the extension is active"},{"name":"plan.directory","type":"string","required":false,"use":"fallback directory for planning artifacts"},{"name":"migratedTo","type":"string","required":false,"use":"new repository URL; the CLI checks it for updates and migrates the install"}]
- not_in_manifest: "commands, hooks, skills, agents and policies are found by directory (commands, hooks/hooks.json, skills, agents, policies), not declared"
