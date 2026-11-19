---
kind: source
reportedIn:
  - "[openai codex core-plugins source at a037e65](../../documents/github.com/openai%20codex%20core-plugins%20source%20at%20a037e65.md)"
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
observed: 2026-11-05
locator: codex-rs/core-plugins/src/agent_plugin_manifest.rs:18-63, 151-189, 203-217 at a037e65ead8f6789f960e9450bfe6af5a87a0053
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-fields@codex#observation-1
---

Imported from `facts/codex/plugins/manifest-fields.md`, observation 1.

- file: "plugin.json"
- fields: [{"name":"$schema","type":"string","required":true,"use":"must equal the Agent Plugins 1.0.0 schema URI; marks the root plugin.json as an Agent Plugins manifest"},{"name":"name","type":"string","required":true,"use":"plugin id; lowercase letters, digits, dots or hyphens, at most 64 characters; also the display name"},{"name":"version","type":"string","required":false,"use":"plugin version"},{"name":"description","type":"string","required":false,"use":"short and long description in the interface"},{"name":"author.name","type":"string","required":false,"use":"developer name in the interface"},{"name":"author.email","type":"string","required":false,"use":"parsed, not used"},{"name":"author.url","type":"string","required":false,"use":"parsed, not used"},{"name":"homepage","type":"string","required":false,"use":"website URL in the interface"},{"name":"repository","type":"string","required":false,"use":"parsed, not used"},{"name":"license","type":"string","required":false,"use":"parsed, not used"},{"name":"keywords","type":"string[]","required":false,"use":"plugin keywords"},{"name":"extensions","type":"object","required":false,"use":"namespaced settings; Codex reads extensions[\"com.openai\"]"},{"name":"extensions[\"com.openai\"]","type":"object","required":false,"use":"OpenAI overlay, parsed with the .codex-plugin/plugin.json field set; its apps, hooks, onboardingSkill and interface replace the defaults","note":"When absent, a .codex-plugin/plugin.json next to the root manifest supplies the overlay."},{"name":"extensions[\"com.openai\"].onboardingSkill","type":"string","required":false,"use":"path to a packaged SKILL.md run as setup after install"}]
- defaults: {"skills":"skills","mcp_servers":"mcp.json","category":"Other"}
