---
type: Harness Fact
title: "Goose: Plugin manifest validation"
description: "Plugin manifest validation in Goose, as observed over time."
tags: [plugins]
harness: goose
subject: plugins/manifest-validation
observations:
  - value:
      unknown_fields: ignored
      invalid_fields: "install fails: a manifest that does not parse, a name outside 1-64 lowercase letters, digits, dashes and periods, a skills or mcpServers path that is not a string, does not start with dot-slash or leaves the plugin, a non-boolean exclusive, or an invalid MCP server document"
    since: null
    until: null
    observed: "2026-11-05"
    source: goose-source
    locator: "crates/goose/src/plugins/formats/open_plugins.rs:69-100, 155-170, 204-250, 254-270, 345-412 at 4facf56cbab049142809d9afa4648ebe6823ba80"
    evidence: source
open:
  - question: "Does goose ship a validate command or a published JSON Schema for plugin.json? The plugin CLI has only install and update."
    observed: "2026-11-05"
    source: goose-source
sources:
  - id: goose-source
    resource: "https://github.com/block/goose/blob/4facf56cbab049142809d9afa4648ebe6823ba80/crates/goose/src/plugins/formats/open_plugins.rs"
    title: "block/goose open_plugins.rs at 4facf56"
---

What the sources say about [Plugin manifest validation](/subjects/plugins/manifest-validation.md)
in [Goose](/harnesses/goose.md).

## Observations

- 2026-11-05: unknown fields: ignored (the struct has no `deny_unknown_fields`). Bad names, bad
  component paths and bad MCP documents fail the install.[^goose-source]

  ```rust
              serde_json::from_str::<OpenPluginsManifest>(&fs::read_to_string(&manifest_path)?)
                  .with_context(|| format!("Failed to parse {}", manifest_path.display()))?
  ...
          bail!(
              "Invalid Open Plugins name '{}'. Names may only contain lowercase letters, numbers, dashes, and periods",
  ...
      if !path.starts_with("./") {
          bail!(
              "Open Plugins component paths must start with './': {}",
  ```

## Open questions

- Does goose ship a validate command or a published JSON Schema for `plugin.json`? None was found.[^goose-source]

[^goose-source]: block/goose open_plugins.rs at 4facf56
