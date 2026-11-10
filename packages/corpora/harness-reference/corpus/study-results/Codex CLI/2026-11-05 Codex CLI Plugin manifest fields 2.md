---
kind: source
reportedIn:
  - "[openai codex core-plugins source at a037e65](../../documents/github.com/openai%20codex%20core-plugins%20source%20at%20a037e65.md)"
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
observed: 2026-11-05
locator: codex-rs/core-plugins/src/manifest.rs:48-121, 289-392, 540-555; codex-rs/exec-server-protocol/src/protocol.rs:55-59 at a037e65ead8f6789f960e9450bfe6af5a87a0053
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-fields@codex#observation-2
---

Imported from `facts/codex/plugins/manifest-fields.md`, observation 2.

- legacy_file: ".codex-plugin/plugin.json"
- legacy_also_read: [".claude-plugin/plugin.json",".cursor-plugin/plugin.json"]
- legacy_fields: [{"name":"name","type":"string","required":false,"use":"plugin id; the plugin directory's name when empty"},{"name":"version","type":"string","required":false,"use":"plugin version; blank is treated as absent"},{"name":"description","type":"string","required":false,"use":"plugin description"},{"name":"keywords","type":"string[]","required":false,"use":"plugin keywords"},{"name":"skills","type":"string | string[]","required":false,"use":"skill directories; paths must be dot-slash relative and stay inside the plugin root"},{"name":"commands","type":"string | string[]","required":false,"use":"command files migrated into skills; default commands directory"},{"name":"mcpServers","type":"string | object","required":false,"use":"MCP server config file path, or inline servers"},{"name":"apps","type":"string","required":false,"use":"path to the .app.json of registered MCP server mappings"},{"name":"hooks","type":"string | string[] | object | object[]","required":false,"use":"hook file paths or inline hooks"},{"name":"interface.displayName","type":"string","required":false,"use":"display name"},{"name":"interface.shortDescription","type":"string","required":false,"use":"subtitle"},{"name":"interface.longDescription","type":"string","required":false,"use":"long description"},{"name":"interface.developerName","type":"string","required":false,"use":"publisher name"},{"name":"interface.category","type":"string","required":false,"use":"category; a marketplace entry's category wins"},{"name":"interface.capabilities","type":"string[]","required":false,"use":"capability labels"},{"name":"interface.websiteUrl","type":"string","required":false,"use":"website link","note":"Alias websiteURL."},{"name":"interface.privacyPolicyUrl","type":"string","required":false,"use":"privacy policy link","note":"Alias privacyPolicyURL."},{"name":"interface.termsOfServiceUrl","type":"string","required":false,"use":"terms of service link","note":"Alias termsOfServiceURL."},{"name":"interface.defaultPrompt","type":"string | string[]","required":false,"use":"starter prompts; at most 3, each at most 128 characters"},{"name":"interface.brandColor","type":"string","required":false,"use":"brand color"},{"name":"interface.composerIcon","type":"string","required":false,"use":"composer icon path"},{"name":"interface.logo","type":"string","required":false,"use":"logo path"},{"name":"interface.logoDark","type":"string","required":false,"use":"dark logo path"},{"name":"interface.screenshots","type":"string[]","required":false,"use":"screenshot paths"},{"name":"extensions[\"com.openai\"].onboardingSkill","type":"string","required":false,"use":"path to a packaged SKILL.md run as setup after install"}]
