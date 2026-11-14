---
kind: source
reportedIn:
  - "[openai codex core-plugins source at a037e65](../../documents/github.com/openai%20codex%20core-plugins%20source%20at%20a037e65.md)"
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
observed: 2026-11-05
locator: codex-rs/core-plugins/src/agent_plugin_manifest.rs:53-63, 75-80, 108-145; manifest.rs:400-470, 590-660; manifest/manifest_cache.rs:59-95 at a037e65ead8f6789f960e9450bfe6af5a87a0053
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-validation@codex#observation-1
---

Imported from `facts/codex/plugins/manifest-validation.md`, observation 1.

- unknown_fields: "warned in a root plugin.json (Agent Plugins format) and dropped; ignored silently in .codex-plugin/plugin.json; rejected inside the Agent Plugins author object"
- invalid_fields: "a field that fails to parse, a null in a typed Agent Plugins field, a wrong $schema or a bad name: the manifest is not loaded, with a warning. A path or hooks value of the wrong shape, or a path that is not dot-slash relative or leaves the plugin root: that field is ignored, with a warning"
- schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"
