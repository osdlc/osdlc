---
type: Harness Fact
title: "Codex CLI: Plugin manifest validation"
description: "Plugin manifest validation in Codex CLI, as observed over time."
tags: [plugins]
harness: codex
subject: plugins/manifest-validation
observations:
  - value:
      unknown_fields: "warned in a root plugin.json (Agent Plugins format) and dropped; ignored silently in .codex-plugin/plugin.json; rejected inside the Agent Plugins author object"
      invalid_fields: "a field that fails to parse, a null in a typed Agent Plugins field, a wrong $schema or a bad name: the manifest is not loaded, with a warning. A path or hooks value of the wrong shape, or a path that is not dot-slash relative or leaves the plugin root: that field is ignored, with a warning"
      schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"
    since: null
    until: null
    observed: "2026-11-05"
    source: codex-source
    locator: "codex-rs/core-plugins/src/agent_plugin_manifest.rs:53-63, 75-80, 108-145; manifest.rs:400-470, 590-660; manifest/manifest_cache.rs:59-95 at a037e65ead8f6789f960e9450bfe6af5a87a0053"
    evidence: source
  - value:
      marketplace_unknown_fields: "top level ignored; in a plugin entry, kept as fallback manifest metadata"
      marketplace_invalid_fields: "a wrong type in a parsed field fails the whole marketplace file; an unsupported or unresolvable source, or an invalid plugin name, skips that entry with a warning"
    since: null
    until: null
    observed: "2026-11-05"
    source: codex-source
    locator: "codex-rs/core-plugins/src/marketplace.rs:388-412, 521-537, 600-627 at a037e65ead8f6789f960e9450bfe6af5a87a0053"
    evidence: source
open:
  - question: "Does Codex ship a command that validates a plugin or marketplace manifest? The CLI's plugin and marketplace commands show no validate subcommand, and the docs name none."
    observed: "2026-11-05"
    source: codex-source
sources:
  - id: codex-source
    resource: "https://github.com/openai/codex/tree/a037e65ead8f6789f960e9450bfe6af5a87a0053/codex-rs/core-plugins/src"
    title: "openai/codex core-plugins source at a037e65"
---

What the sources say about [Plugin manifest validation](/subjects/plugins/manifest-validation.md)
in [Codex CLI](/harnesses/codex.md).

## Observations

- 2026-11-05: unknown fields: warned and dropped in a root `plugin.json`, ignored in
  `.codex-plugin/plugin.json` (no `deny_unknown_fields` on that struct), rejected inside the Agent
  Plugins `author` object. A manifest that fails to parse is not loaded; a badly shaped path field
  is ignored with a warning. Schema: the Agent Plugins 1.0.0 plugin schema.[^codex-source]

  ```rust
      for field in object.keys() {
          if !AGENT_PLUGIN_FIELDS.contains(&field.as_str()) {
              tracing::warn!(path = %manifest_path, field, "ignoring unknown Agent Plugins manifest field");
          }
      }
  ...
  #[derive(Debug, Deserialize)]
  #[serde(deny_unknown_fields)]
  struct RawAgentPluginAuthor {
  ...
              return Err(compatibility_json_error(format!(
                  "Agent Plugins `{field}` must use its declared type when present"
  ...
              Err(err) => {
                  tracing::warn!(
                      path = %manifest_path.display(),
                      "failed to parse plugin manifest: {err}"
                  );
                  None
  ...
          tracing::warn!("ignoring {field}: path must start with `./` relative to plugin root");
  ```

- 2026-11-05: marketplace: unknown top-level keys are ignored; unknown entry keys are kept as
  fallback manifest metadata. A parse error fails the whole file; a bad source or plugin name skips
  only that entry.[^codex-source]

  ```rust
      serde_json::from_str(&contents).map_err(|err| MarketplaceError::InvalidMarketplaceFile {
  ...
                  Err(MarketplaceError::InvalidPlugin(message)) => {
                      warn!(
                          ...
                          "skipping invalid marketplace plugin"
  ...
                  "skipping marketplace plugin with unsupported source"
  ```

## Open questions

- Does Codex ship a command that validates a plugin or marketplace manifest? None was found in the
  CLI's plugin and marketplace commands.[^codex-source]

[^codex-source]: openai/codex core-plugins source at a037e65
