---
type: Harness Fact
title: "Goose: Plugin manifest fields"
description: "Plugin manifest fields in Goose, as observed over time."
tags: [plugins]
harness: goose
subject: plugins/manifest-fields
observations:
  - value:
      file: plugin.json
      also_read: [.goose-plugin/plugin.json, .plugin/plugin.json]
      fields:
        - { name: name, type: string, required: false, use: "plugin id and install directory; namespaces skills as name:skill; 1-64 lowercase letters, digits, dashes or periods", note: "When empty or absent, goose infers the name from the source URL or the directory." }
        - { name: version, type: string, required: false, use: "shown on install; unknown when absent" }
        - { name: skills, type: "string | string[] | object", required: false, use: "skill directories; an object takes paths and exclusive (true replaces the default skills directory)" }
        - { name: mcpServers, type: "string | string[] | object", required: false, use: "MCP config file paths (default .mcp.json), or an inline object with an mcpServers key" }
      not_in_manifest: "hooks come from hooks/hooks.json, not a manifest key"
      gemini_file: gemini-extension.json
      gemini_fields:
        - { name: name, type: string, required: true, use: "plugin id" }
        - { name: version, type: string, required: true, use: "plugin version" }
    since: null
    until: null
    observed: "2026-11-05"
    source: goose-source
    locator: "crates/goose/src/plugins/formats/open_plugins.rs:14-33, 155-180, 340-412; crates/goose/src/plugins/formats/gemini.rs:11-17 at 4facf56cbab049142809d9afa4648ebe6823ba80"
    evidence: source
  - value: { docs_fields: [name, version, description] }
    since: null
    until: null
    observed: "2026-11-05"
    source: goose-plugins-doc
    locator: "documentation/docs/guides/context-engineering/plugins.md, Plugin Structure, at 4facf56cbab049142809d9afa4648ebe6823ba80"
    evidence: docs
    note: "The docs example has description; the Open Plugins manifest struct does not declare it, so goose does not read it."
open:
  - question: "Do the skills and mcpServers path rules (each path must start with ./ and stay inside the plugin) appear in any goose doc? Only the code states them."
    observed: "2026-11-05"
    source: goose-source
sources:
  - id: goose-source
    resource: "https://github.com/block/goose/tree/4facf56cbab049142809d9afa4648ebe6823ba80/crates/goose/src/plugins/formats"
    title: "block/goose plugin format source at 4facf56"
  - id: goose-plugins-doc
    resource: "https://github.com/block/goose/blob/4facf56cbab049142809d9afa4648ebe6823ba80/documentation/docs/guides/context-engineering/plugins.md"
    title: "goose docs source: Plugins at 4facf56"
---

What the sources say about [Plugin manifest fields](/subjects/plugins/manifest-fields.md) in
[Goose](/harnesses/goose.md).

Goose reads two formats: Open Plugins (`plugin.json`) and Gemini extensions
(`gemini-extension.json`).

## Observations

- 2026-11-05: file: `plugin.json` (also `.goose-plugin/plugin.json`, `.plugin/plugin.json`);
  fields: name, version, skills, mcpServers, all optional. Gemini format: name and version, both
  required.[^goose-source]

  ```rust
  const MANIFESTS: [&str; 3] = [
      ".goose-plugin/plugin.json",
      ".plugin/plugin.json",
      "plugin.json",
  ];
  ...
  pub struct OpenPluginsManifest {
      #[serde(default)]
      pub name: Option<String>,
      #[serde(default)]
      pub version: Option<String>,
      #[serde(default)]
      pub skills: Option<serde_json::Value>,
      #[serde(default, rename = "mcpServers")]
      pub mcp_servers: Option<serde_json::Value>,
  }
  ...
      if manifest.name.as_deref().map(str::is_empty).unwrap_or(true) {
          manifest.name = Some(infer_name(plugin_dir, source));
      }
  ...
  struct GeminiManifest {
      name: String,
      version: String,
  }
  ```

- 2026-11-05: the docs example lists name, version and description. The code does not read
  description, so docs and code differ on that field.[^goose-plugins-doc]

  > ```json title="plugin.json"
  > {
  >   "name": "my-plugin",
  >   "version": "1.0.0",
  >   "description": "Reusable skills and hooks for my team"
  > }
  > ```

## Open questions

- The rule that each skills or mcpServers path starts with `./` and stays inside the plugin is in
  the code only.[^goose-source]

[^goose-source]: block/goose plugin format source at 4facf56
[^goose-plugins-doc]: goose docs source: Plugins at 4facf56
