---
type: Harness Fact
title: "Codex CLI: Marketplace fields"
description: "Marketplace fields in Codex CLI, as observed over time."
tags: [plugins]
harness: codex
subject: plugins/marketplace-fields
observations:
  - value:
      file: .agents/plugins/marketplace.json
      also_read: [.agents/plugins/api_marketplace.json, .claude-plugin/marketplace.json, .cursor-plugin/marketplace.json]
      fields:
        - { name: name, type: string, required: true, use: "marketplace id; the part after @ in plugin-name@marketplace-name" }
        - { name: interface.displayName, type: string, required: false, use: "marketplace title in the plugin browser" }
        - { name: plugins, type: array, required: true, use: "the plugin entries" }
      entry_fields:
        - { name: name, type: string, required: true, use: "plugin id within the marketplace" }
        - { name: source, type: "string | object", required: true, use: "where the plugin is installed from; a string is a local path" }
        - { name: source.source, type: string, required: true, use: "source kind: local, url, git-subdir or npm" }
        - { name: source.path, type: string, required: "conditional", use: "local plugin directory, or the subdirectory inside a git repository", note: "Required for local and git-subdir; optional for url." }
        - { name: source.url, type: string, required: "conditional", use: "git repository URL", note: "Required for url and git-subdir." }
        - { name: source.ref, type: string, required: false, use: "git ref to check out (url, git-subdir)" }
        - { name: source.sha, type: string, required: false, use: "git commit to check out (url, git-subdir)" }
        - { name: source.package, type: string, required: "conditional", use: "npm package name", note: "Required for npm." }
        - { name: source.version, type: string, required: false, use: "npm version, dist-tag or range" }
        - { name: source.registry, type: string, required: false, use: "npm registry; HTTPS, no credentials, query or fragment" }
        - { name: policy.installation, type: string, required: false, use: "NOT_AVAILABLE, AVAILABLE (default) or INSTALLED_BY_DEFAULT" }
        - { name: policy.authentication, type: string, required: false, use: "ON_INSTALL (default) or ON_USE" }
        - { name: policy.products, type: array, required: false, use: "products the plugin is offered in; carried, not enforced" }
        - { name: category, type: string, required: false, use: "category; wins over the plugin manifest's interface.category" }
      other_entry_fields: "any other key is kept as fallback plugin-manifest metadata (displayName, author.name, homepage, interface) for a plugin with no manifest of its own"
      source_forms: [relative path string, local, url, git-subdir, npm]
    since: null
    until: null
    observed: "2026-11-05"
    source: codex-source
    locator: "codex-rs/core-plugins/src/marketplace.rs:20-25, 166-185, 1004-1079, 1104-1172 at a037e65ead8f6789f960e9450bfe6af5a87a0053"
    evidence: source
  - value: { docs_entry_required: [policy.installation, policy.authentication, category] }
    since: null
    until: null
    observed: "2026-11-05"
    source: openai-plugin-build
    locator: "Marketplace metadata"
    evidence: docs
    note: "The docs say to always include these three; the code gives the two policy keys defaults and treats category as optional."
sources:
  - id: codex-source
    resource: "https://github.com/openai/codex/blob/a037e65ead8f6789f960e9450bfe6af5a87a0053/codex-rs/core-plugins/src/marketplace.rs"
    title: "openai/codex marketplace.rs at a037e65"
  - id: openai-plugin-build
    resource: "https://developers.openai.com/codex/plugins/build.md"
    title: "OpenAI docs: Package your plugin"
---

What the sources say about [Marketplace fields](/subjects/plugins/marketplace-fields.md) in
[Codex CLI](/harnesses/codex.md).

## Observations

- 2026-11-05: file: `.agents/plugins/marketplace.json` (also `api_marketplace.json` beside it,
  `.claude-plugin/marketplace.json` and `.cursor-plugin/marketplace.json`); fields: name (required),
  interface.displayName, plugins (required); entry fields: name and source (required), the source
  keys per form, policy.installation, policy.authentication, policy.products, category. Any other
  entry key is kept as fallback manifest metadata. Source forms: a relative path string, local,
  url, git-subdir, npm.[^codex-source]

  ```rust
  const MARKETPLACE_MANIFEST_RELATIVE_PATHS: &[&str] = &[
      ".agents/plugins/marketplace.json",
      ".agents/plugins/api_marketplace.json",
      ".claude-plugin/marketplace.json",
      ".cursor-plugin/marketplace.json",
  ];
  ...
  struct RawMarketplaceManifest {
      name: String,
      #[serde(default)]
      interface: Option<RawMarketplaceManifestInterface>,
      plugins: Vec<RawMarketplaceManifestPlugin>,
  }
  struct RawMarketplaceManifestPlugin {
      name: String,
      source: RawMarketplaceManifestPluginSource,
      #[serde(default)]
      policy: RawMarketplaceManifestPluginPolicy,
      #[serde(default)]
      category: Option<String>,
      #[serde(default)]
      #[serde(flatten)]
      manifest_fields: JsonMap<String, JsonValue>,
  }
  struct RawMarketplaceManifestPluginPolicy {
      #[serde(default)]
      installation: MarketplacePluginInstallPolicy,
      #[serde(default)]
      authentication: MarketplacePluginAuthPolicy,
      products: Option<Vec<Product>>,
  }
  #[serde(tag = "source", rename_all = "lowercase")]
  enum RawMarketplaceManifestPluginSourceObject {
      Local { path: String },
      Url { url: String, path: Option<String>, #[serde(rename = "ref")] ref_name: Option<String>, sha: Option<String> },
      #[serde(rename = "git-subdir")]
      GitSubdir { url: String, path: String, ref_name: Option<String>, sha: Option<String> },
      Npm { package: String, version: Option<String>, registry: Option<String> },
  }
  ```

- 2026-11-05: the docs say every entry should carry policy.installation, policy.authentication and
  category. The code defaults the two policy keys to `AVAILABLE` and `ON_INSTALL` and leaves
  category optional, so the docs and the code disagree on "required".[^openai-plugin-build]

  > - Always include `policy.installation`, `policy.authentication`, and
  >   `category` on each plugin entry.

[^codex-source]: openai/codex marketplace.rs at a037e65
[^openai-plugin-build]: OpenAI docs: Package your plugin
