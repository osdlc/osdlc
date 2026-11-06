---
type: Harness Fact
title: "Qwen Code: Plugin manifest validation"
description: "Plugin manifest validation in Qwen Code, as observed over time."
tags: [plugins]
harness: qwen-code
subject: plugins/manifest-validation
observations:
  - value:
      unknown_fields: "ignored in qwen-extension.json; warned and ignored in an Agent Plugins plugin.json; rejected inside the Agent Plugins author object"
      invalid_fields: "a missing name, a name with other characters, a bad settings envVar or malformed JSON fails the load; in an Agent Plugins manifest a wrong $schema, bad name, or wrong-typed version, description, homepage, repository, license, author or keywords fails the load"
    since: null
    until: null
    observed: "2026-11-05"
    source: qwen-code-source
    locator: "packages/core/src/extension/extensionManager.ts:2128-2178, 3702-3708; agent-plugins-v1/manifest.ts:93-183 at 1bac51b7d9e28d5c0f7d9a0a6fcd3add14443ebb"
    evidence: source
  - value: { marketplace_invalid_fields: "strict true with no plugin.json, an unsupported source type, or a source that leaves the marketplace or repository root fails that plugin's install" }
    since: null
    until: null
    observed: "2026-11-05"
    source: qwen-code-claude-converter
    locator: "packages/core/src/extension/claude-converter.ts:520-530, 1048-1053, 1185-1300 at 1bac51b7d9e28d5c0f7d9a0a6fcd3add14443ebb"
    evidence: source
open:
  - question: "Does Qwen Code ship a validate command or a published JSON Schema for qwen-extension.json? The extensions command folder has no validate command, and no schema was found."
    observed: "2026-11-05"
    source: qwen-code-source
sources:
  - id: qwen-code-source
    resource: "https://github.com/QwenLM/qwen-code/tree/1bac51b7d9e28d5c0f7d9a0a6fcd3add14443ebb/packages/core/src/extension"
    title: "QwenLM/qwen-code extension source at 1bac51b"
  - id: qwen-code-claude-converter
    resource: "https://github.com/QwenLM/qwen-code/blob/1bac51b7d9e28d5c0f7d9a0a6fcd3add14443ebb/packages/core/src/extension/claude-converter.ts"
    title: "QwenLM/qwen-code claude-converter.ts at 1bac51b"
---

What the sources say about [Plugin manifest validation](/subjects/plugins/manifest-validation.md)
in [Qwen Code](/harnesses/qwen-code.md).

## Observations

- 2026-11-05: unknown fields: ignored in `qwen-extension.json` (parsed with `JSON.parse` and
  cast); warned in an Agent Plugins `plugin.json`; rejected in its `author` object. Missing or bad
  names and malformed files fail the load.[^qwen-code-source]

  ```ts
    for (const field of Object.keys(value)) {
      if (!MANIFEST_FIELDS.has(field)) {
        debugLogger.warn(
          `Ignoring unknown Agent Plugins manifest field "${field}".`,
  ...
      if (!AUTHOR_FIELDS.has(field)) {
        throw new Error(`Unknown Agent Plugins author field "${field}".`);
  ...
  export function validateName(name: string) {
    if (!/^[a-zA-Z0-9-_.]+$/.test(name)) {
  ```

- 2026-11-05: marketplace entries: `strict: true` without a plugin.json, an unsupported source,
  or a path that escapes its root fails that install.[^qwen-code-claude-converter]

  ```ts
    if (strict && !fs.existsSync(pluginJsonPath)) {
      throw new Error(`Strict mode requires plugin.json at ${pluginJsonPath}`);
  ...
    throw new Error(`Unsupported plugin source type: ${JSON.stringify(source)}`);
  ```

## Open questions

- Does Qwen Code ship a validate command or a published JSON Schema for `qwen-extension.json`?
  None was found.[^qwen-code-source]

[^qwen-code-source]: QwenLM/qwen-code extension source at 1bac51b
[^qwen-code-claude-converter]: QwenLM/qwen-code claude-converter.ts at 1bac51b
