---
type: Harness Fact
title: "Grok Build: Plugin manifest validation"
description: "Plugin manifest validation in Grok Build, as observed over time."
tags: [plugins]
harness: grok-build
subject: plugins/manifest-validation
observations:
  - value:
      unknown_fields: ignored
      invalid_fields: "a parse error or an invalid name fails the manifest load; discovery skips the plugin with a warning"
    since: null
    until: null
    observed: "2026-11-05"
    source: grok-build-manifest
    locator: "crates/codegen/xai-grok-agent/src/plugins/manifest.rs:9, 117, 154-166, 274-295 and plugins/discovery.rs:605-657 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8"
    evidence: source
  - value:
      validator: "grok plugin validate [<path>]"
      validator_checks: "loads the manifest from the search order and runs the same name check; prints name, version, description and a component summary"
    since: null
    until: null
    observed: "2026-11-05"
    source: grok-build-plugin-cmd
    locator: "crates/codegen/xai-grok-pager/src/plugin_cmd.rs:135-136, 688-718 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8"
    evidence: source
  - value:
      marketplace_unknown_fields: ignored
      marketplace_invalid_fields: "a file that exists but does not parse is an error; no fallback to the next candidate"
    since: null
    until: null
    observed: "2026-11-05"
    source: grok-build-index
    locator: "crates/codegen/xai-grok-plugin-marketplace/src/index.rs:14-64, 124-128, 190-217 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8"
    evidence: source
    note: "The index structs set no deny_unknown_fields, and unknown keys in a source object are skipped as IgnoredAny."
sources:
  - id: grok-build-manifest
    resource: "https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-agent/src/plugins/manifest.rs"
    title: "xai-org/grok-build: plugins/manifest.rs"
  - id: grok-build-plugin-cmd
    resource: "https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/src/plugin_cmd.rs"
    title: "xai-org/grok-build: plugin_cmd.rs"
  - id: grok-build-index
    resource: "https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-plugin-marketplace/src/index.rs"
    title: "xai-org/grok-build: plugin-marketplace/index.rs"
---

What the sources say about [Plugin manifest validation](/subjects/plugins/manifest-validation.md)
in [Grok Build](/harnesses/grok-build.md).

## Observations

- 2026-11-05: plugin.json: unknown fields ignored; a parse error or invalid name skips the
  plugin.[^grok-build-manifest]

  ```rust
  //! The parser is forward-compatible: unknown fields are silently ignored so that manifests authored for newer upstream versions still load.
  ```

  ```rust
  let manifest: PluginManifest =
      serde_json::from_str(&content).map_err(|e| ManifestError::ParseError {
          path: manifest_path.clone(),
          message: e.to_string(),
      })?;
  manifest.validate()?;
  ```

  ```rust
  Err(e) => {
      tracing::warn!(
          path = %plugin_root.display(),
          error = %e,
          "failed to load plugin manifest; skipping"
      );
      return;
  }
  ```

- 2026-11-05: validator: `grok plugin validate`.[^grok-build-plugin-cmd]

  ```rust
  /// Validate a plugin manifest
  Validate {
  ...
  fn cmd_validate(path: &str) -> Result<()> {
      ...
      match load_manifest(&root) {
          Ok(ManifestLoadResult::Found(manifest)) => {
              manifest
                  .validate()
                  .map_err(|e| anyhow::anyhow!("Manifest validation failed: {e}"))?;
              println!("Plugin manifest is valid.");
  ```

- 2026-11-05: marketplace.json: unknown fields ignored; a broken file is an error.[^grok-build-index]

  ```rust
  _ => {
      let _ = map.next_value::<serde::de::IgnoredAny>()?;
  }
  ...
  /// Returns `Err` if a file exists but can't be parsed.
  pub fn load_index(marketplace_root: &Path) -> Result<Option<MarketplaceIndex>, String> {
  ```

[^grok-build-manifest]: xai-org/grok-build: plugins/manifest.rs
[^grok-build-plugin-cmd]: xai-org/grok-build: plugin_cmd.rs
[^grok-build-index]: xai-org/grok-build: plugin-marketplace/index.rs
