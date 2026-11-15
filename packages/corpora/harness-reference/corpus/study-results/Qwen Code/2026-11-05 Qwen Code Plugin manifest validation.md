---
kind: source
reportedIn:
  - "[QwenLM qwen-code extension source at 1bac51b](../../documents/github.com/QwenLM%20qwen-code%20extension%20source%20at%201bac51b.md)"
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
observed: 2026-11-05
locator: packages/core/src/extension/extensionManager.ts:2128-2178, 3702-3708; agent-plugins-v1/manifest.ts:93-183 at 1bac51b7d9e28d5c0f7d9a0a6fcd3add14443ebb
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-validation@qwen-code#observation-1
---

Imported from `facts/qwen-code/plugins/manifest-validation.md`, observation 1.

- unknown_fields: "ignored in qwen-extension.json; warned and ignored in an Agent Plugins plugin.json; rejected inside the Agent Plugins author object"
- invalid_fields: "a missing name, a name with other characters, a bad settings envVar or malformed JSON fails the load; in an Agent Plugins manifest a wrong $schema, bad name, or wrong-typed version, description, homepage, repository, license, author or keywords fails the load"
