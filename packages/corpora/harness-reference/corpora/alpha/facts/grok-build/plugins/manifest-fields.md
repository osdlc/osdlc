---
type: Harness Fact
title: "Grok Build: Plugin manifest fields"
description: "Plugin manifest fields in Grok Build, as observed over time."
tags: [plugins]
harness: grok-build
subject: plugins/manifest-fields
observations:
  - value:
      file: plugin.json
      files_checked: [plugin.json, .grok-plugin/plugin.json, .claude-plugin/plugin.json]
      fields:
        - { name: name, type: string, required: true, use: "plugin namespace; 1-64 lowercase letters, digits and hyphens, no leading or trailing hyphen" }
        - { name: version, type: string, required: false, use: "semver version; grok plugin tag makes a release tag from it" }
        - { name: description, type: string, required: false, use: "printed by grok plugin validate" }
        - { name: author, type: object, required: false, use: "not documented" }
        - { name: author.name, type: string, required: false, use: "not documented" }
        - { name: author.email, type: string, required: false, use: "not documented" }
        - { name: author.url, type: string, required: false, use: "not documented" }
        - { name: homepage, type: string, required: false, use: "not documented" }
        - { name: repository, type: string, required: false, use: "not documented" }
        - { name: license, type: string, required: false, use: "not documented" }
        - { name: keywords, type: "string[]", required: false, use: "not documented" }
        - { name: skills, type: "string | string[]", required: false, use: "skill directories; replaces the default skills directory" }
        - { name: commands, type: "string | string[]", required: false, use: "command directories; replaces the default commands directory" }
        - { name: agents, type: "string | string[]", required: false, use: "agent directories; replaces the default agents directory" }
        - { name: hooks, type: "string | object", required: false, use: "hooks file path or inline hooks; default hooks/hooks.json" }
        - { name: mcpServers, type: "string | object", required: false, use: "MCP config path or inline servers; default .mcp.json" }
        - { name: lspServers, type: "string | object", required: false, use: "LSP config path or inline servers; default .lsp.json" }
    since: null
    until: null
    observed: "2026-11-05"
    source: grok-build-manifest
    locator: "crates/codegen/xai-grok-agent/src/plugins/manifest.rs:1-9, 17-36, 117-152, 168-210, 261-265 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8"
    evidence: source
    note: "files_checked is the search order. A paths field that is set replaces the default directory (resolve_dirs), although a code comment calls the fields overrides that supplement the convention dirs. Paths that escape the plugin root are skipped with a warning."
open:
  - question: "Does Grok Build show author, homepage, repository, license or keywords from plugin.json anywhere? The struct parses them but the code read does not use them."
    observed: "2026-11-05"
    source: grok-build-manifest
sources:
  - id: grok-build-manifest
    resource: "https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-agent/src/plugins/manifest.rs"
    title: "xai-org/grok-build: plugins/manifest.rs"
---

What the sources say about [Plugin manifest fields](/subjects/plugins/manifest-fields.md) in
[Grok Build](/harnesses/grok-build.md).

## Observations

- 2026-11-05: file: `plugin.json` at the plugin root, then `.grok-plugin/plugin.json`, then
  `.claude-plugin/plugin.json`; fields: `name` (required), `version`, `description`, `author`
  (`name`, `email`, `url`), `homepage`, `repository`, `license`, `keywords`, `skills`,
  `commands`, `agents`, `hooks`, `mcpServers`, `lspServers`.[^grok-build-manifest]

  ```rust
  /// Forward-compatible: unknown fields are silently ignored because `#[serde(deny_unknown_fields)]` is not set.
  #[derive(Debug, Clone, Default, Deserialize)]
  #[serde(rename_all = "camelCase")]
  pub struct PluginManifest {
      /// User-facing plugin namespace (kebab-case).  Required.
      pub name: String,
      /// Semver version string.
      #[serde(default)]
      pub version: Option<String>,
      #[serde(default)]
      pub description: Option<String>,
      #[serde(default)]
      pub author: Option<Author>,
      #[serde(default)]
      pub homepage: Option<String>,
      #[serde(default)]
      pub repository: Option<String>,
      #[serde(default)]
      pub license: Option<String>,
      #[serde(default)]
      pub keywords: Vec<String>,

      // ── Component path overrides (supplement convention dirs) ──────
      #[serde(default)]
      pub skills: Option<PathOrPaths>,
      #[serde(default)]
      pub commands: Option<PathOrPaths>,
      #[serde(default)]
      pub agents: Option<PathOrPaths>,
      #[serde(default)]
      pub hooks: Option<PathOrInline>,
      #[serde(default)]
      pub mcp_servers: Option<PathOrInline>,
      #[serde(default)]
      pub lsp_servers: Option<PathOrInline>,
  }
  ```

  ```rust
  const MANIFEST_PATHS: &[&str] = &[
      "plugin.json",
      ".grok-plugin/plugin.json",
      ".claude-plugin/plugin.json",
  ];
  ```

## Open questions

- Whether the metadata fields beyond `name`, `version` and `description` are shown anywhere.[^grok-build-manifest]

[^grok-build-manifest]: xai-org/grok-build: plugins/manifest.rs
