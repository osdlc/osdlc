---
type: Harness Fact
title: "Grok Build: Marketplace fields"
description: "Marketplace fields in Grok Build, as observed over time."
tags: [plugins]
harness: grok-build
subject: plugins/marketplace-fields
observations:
  - value:
      file: .grok-plugin/marketplace.json
      files_checked: [.grok-plugin/marketplace.json, .grok-plugin/plugin.json, .claude-plugin/marketplace.json, .claude-plugin/plugin.json]
      fields:
        - { name: name, type: string, required: true, use: "marketplace display name" }
        - { name: description, type: string, required: false, use: "not documented" }
        - { name: owner, type: object, required: false, use: "not documented" }
        - { name: owner.name, type: string, required: "conditional", use: "not documented", note: "Required when owner is set." }
        - { name: owner.email, type: string, required: false, use: "not documented" }
        - { name: plugins, type: array, required: false, use: "plugin entries; defaults to empty" }
      entry_fields:
        - { name: name, type: string, required: true, use: "plugin name" }
        - { name: version, type: string, required: false, use: "version from index metadata" }
        - { name: description, type: string, required: false, use: "not documented" }
        - { name: category, type: string, required: false, use: "category, such as development, productivity or design" }
        - { name: author, type: object, required: false, use: "not documented" }
        - { name: author.name, type: string, required: "conditional", use: "not documented", note: "Required when author is set." }
        - { name: source, type: "string | object", required: false, use: "plugin location; a plugin without one has no resolvable path" }
        - { name: homepage, type: string, required: false, use: "not documented" }
        - { name: tags, type: "string[]", required: false, use: "not documented" }
        - { name: keywords, type: "string[]", required: false, use: "matcher keywords that tie the plugin to a user request" }
        - { name: domains, type: "string[]", required: false, use: "matcher domains that tie the plugin to a user request" }
      source_forms: ["relative path (string)", "local (type or source, path)", "url (type or source, url, ref, sha, path)"]
    since: null
    until: null
    observed: "2026-11-05"
    source: grok-build-index
    locator: "crates/codegen/xai-grok-plugin-marketplace/src/index.rs:1-147, 187-217 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8"
    evidence: source
    note: "files_checked is the search order. A source object's kind is read from type, or from source when type is absent; its other keys are ignored. path on a url source is the subdirectory."
  - value:
      docs_entry_fields: [name, description, category, source, version, author, homepage, tags, keywords]
      docs_top_level: [name, description, owner, plugins]
    since: null
    until: null
    observed: "2026-11-05"
    source: grok-build-plugins-guide
    locator: "crates/codegen/xai-grok-pager/docs/user-guide/09-plugins.md:185-212 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8"
    evidence: docs
    note: "The guide does not mention domains, which the code reads."
  - value:
      catalog_file: .grok-plugin/plugin-index.json
      catalog_fields:
        - { name: version, type: integer, required: true, use: "catalog format version; only 1 is read" }
        - { name: plugins, type: object, required: false, use: "map from index plugin name to its entry" }
        - { name: "plugins.<name>.sha", type: string, required: "conditional", use: "commit the components came from", note: "Required for URL-sourced entries; must match the index sha or the components are hidden." }
        - { name: "plugins.<name>.components", type: object, required: true, use: "skills, commands, hooks and agents shown in the browser before install" }
    since: null
    until: null
    observed: "2026-11-05"
    source: grok-build-catalog
    locator: "crates/codegen/xai-grok-plugin-marketplace/src/catalog.rs:1-32, 58-98 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8"
    evidence: source
    note: "An optional display-only catalog next to marketplace.json; .claude-plugin/plugin-index.json is the fallback."
sources:
  - id: grok-build-index
    resource: "https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-plugin-marketplace/src/index.rs"
    title: "xai-org/grok-build: plugin-marketplace/index.rs"
  - id: grok-build-catalog
    resource: "https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-plugin-marketplace/src/catalog.rs"
    title: "xai-org/grok-build: plugin-marketplace/catalog.rs"
  - id: grok-build-plugins-guide
    resource: "https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/09-plugins.md"
    title: "Grok Build user guide: Plugins"
---

What the sources say about [Marketplace fields](/subjects/plugins/marketplace-fields.md) in
[Grok Build](/harnesses/grok-build.md).

## Observations

- 2026-11-05: file: `.grok-plugin/marketplace.json`, then `.grok-plugin/plugin.json` and the
  `.claude-plugin/` copies; top-level fields: `name` (required), `description`, `owner` (`name`,
  `email`), `plugins`; entry fields: `name` (required), `version`, `description`, `category`,
  `author` (`name`), `source`, `homepage`, `tags`, `keywords`, `domains`; source forms: a path
  string, a `local` object, a `url` object.[^grok-build-index]

  ```rust
  pub struct MarketplaceIndex {
      /// Marketplace display name.
      pub name: String,
      #[serde(default)]
      pub description: Option<String>,
      #[serde(default)]
      pub owner: Option<IndexOwner>,
      #[serde(default)]
      pub plugins: Vec<IndexEntry>,
  }
  ...
  pub struct IndexEntry {
      pub name: String,
      /// Version string (from index metadata).
      #[serde(default)]
      pub version: Option<String>,
      ...
      /// Category (e.g., "development", "productivity", "design").
      #[serde(default)]
      pub category: Option<String>,
      #[serde(default)]
      pub author: Option<IndexAuthor>,
      /// Source location within the marketplace repo.
      #[serde(default)]
      pub source: Option<IndexSource>,
      ...
      /// Matcher keywords used to associate the plugin with a user request.
      #[serde(default)]
      pub keywords: Vec<String>,
      /// Matcher domains used to associate the plugin with a user request.
      #[serde(default)]
      pub domains: Vec<String>,
  }
  ```

  ```rust
  /// Object: `{ "type": "local", "path": "./plugins/foo" }`; Object: `{ "source": "url", "url": "https://github.com/...", "ref": "main" }`; Object: `{ "source": "url", "url": "https://...", "sha": "61f1903b..." }` (recommended for vendor pins); String: `"./plugins/foo"` (shorthand used by some marketplaces).
  ```

- 2026-11-05: the user guide lists the same fields except `domains`.[^grok-build-plugins-guide]

  > Grok reads the index from `.grok-plugin/marketplace.json`. It also accepts `.grok-plugin/plugin.json` and the `.claude-plugin/` equivalents.

  > Optional per-plugin fields: `version`, `author`, `homepage`, `tags`, and `keywords`.

- 2026-11-05: catalog: an optional `plugin-index.json` with `version` and a `plugins` map of
  `sha` and `components`, for display only.[^grok-build-catalog]

  ```rust
  /// Top-level `plugin-index.json` catalog, keyed by index plugin name.
  pub struct PluginCatalog {
      pub version: u64,
      #[serde(default)]
      pub plugins: HashMap<String, CatalogEntry>,
  }

  pub struct CatalogEntry {
      /// Commit the components were extracted from (required for URL-sourced entries; optional for in-repo plugins).
      #[serde(default)]
      pub sha: Option<String>,
      pub components: PluginComponents,
  }
  ```

[^grok-build-index]: xai-org/grok-build: plugin-marketplace/index.rs
[^grok-build-catalog]: xai-org/grok-build: plugin-marketplace/catalog.rs
[^grok-build-plugins-guide]: Grok Build user guide: Plugins
