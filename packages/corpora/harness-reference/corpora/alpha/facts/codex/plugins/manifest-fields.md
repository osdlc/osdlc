---
type: Harness Fact
title: "Codex CLI: Plugin manifest fields"
description: "Plugin manifest fields in Codex CLI, as observed over time."
tags: [plugins]
harness: codex
subject: plugins/manifest-fields
observations:
  - value:
      file: plugin.json
      fields:
        - { name: $schema, type: string, required: true, use: "must equal the Agent Plugins 1.0.0 schema URI; marks the root plugin.json as an Agent Plugins manifest" }
        - { name: name, type: string, required: true, use: "plugin id; lowercase letters, digits, dots or hyphens, at most 64 characters; also the display name" }
        - { name: version, type: string, required: false, use: "plugin version" }
        - { name: description, type: string, required: false, use: "short and long description in the interface" }
        - { name: author.name, type: string, required: false, use: "developer name in the interface" }
        - { name: author.email, type: string, required: false, use: "parsed, not used" }
        - { name: author.url, type: string, required: false, use: "parsed, not used" }
        - { name: homepage, type: string, required: false, use: "website URL in the interface" }
        - { name: repository, type: string, required: false, use: "parsed, not used" }
        - { name: license, type: string, required: false, use: "parsed, not used" }
        - { name: keywords, type: "string[]", required: false, use: "plugin keywords" }
        - { name: extensions, type: object, required: false, use: "namespaced settings; Codex reads extensions[\"com.openai\"]" }
        - { name: "extensions[\"com.openai\"]", type: object, required: false, use: "OpenAI overlay, parsed with the .codex-plugin/plugin.json field set; its apps, hooks, onboardingSkill and interface replace the defaults", note: "When absent, a .codex-plugin/plugin.json next to the root manifest supplies the overlay." }
        - { name: "extensions[\"com.openai\"].onboardingSkill", type: string, required: false, use: "path to a packaged SKILL.md run as setup after install" }
      defaults: { skills: skills, mcp_servers: mcp.json, category: Other }
    since: null
    until: null
    observed: "2026-11-05"
    source: codex-source
    locator: "codex-rs/core-plugins/src/agent_plugin_manifest.rs:18-63, 151-189, 203-217 at a037e65ead8f6789f960e9450bfe6af5a87a0053"
    evidence: source
  - value:
      legacy_file: .codex-plugin/plugin.json
      legacy_also_read: [.claude-plugin/plugin.json, .cursor-plugin/plugin.json]
      legacy_fields:
        - { name: name, type: string, required: false, use: "plugin id; the plugin directory's name when empty" }
        - { name: version, type: string, required: false, use: "plugin version; blank is treated as absent" }
        - { name: description, type: string, required: false, use: "plugin description" }
        - { name: keywords, type: "string[]", required: false, use: "plugin keywords" }
        - { name: skills, type: "string | string[]", required: false, use: "skill directories; paths must be dot-slash relative and stay inside the plugin root" }
        - { name: commands, type: "string | string[]", required: false, use: "command files migrated into skills; default commands directory" }
        - { name: mcpServers, type: "string | object", required: false, use: "MCP server config file path, or inline servers" }
        - { name: apps, type: string, required: false, use: "path to the .app.json of registered MCP server mappings" }
        - { name: hooks, type: "string | string[] | object | object[]", required: false, use: "hook file paths or inline hooks" }
        - { name: interface.displayName, type: string, required: false, use: "display name" }
        - { name: interface.shortDescription, type: string, required: false, use: "subtitle" }
        - { name: interface.longDescription, type: string, required: false, use: "long description" }
        - { name: interface.developerName, type: string, required: false, use: "publisher name" }
        - { name: interface.category, type: string, required: false, use: "category; a marketplace entry's category wins" }
        - { name: interface.capabilities, type: "string[]", required: false, use: "capability labels" }
        - { name: interface.websiteUrl, type: string, required: false, use: "website link", note: "Alias websiteURL." }
        - { name: interface.privacyPolicyUrl, type: string, required: false, use: "privacy policy link", note: "Alias privacyPolicyURL." }
        - { name: interface.termsOfServiceUrl, type: string, required: false, use: "terms of service link", note: "Alias termsOfServiceURL." }
        - { name: interface.defaultPrompt, type: "string | string[]", required: false, use: "starter prompts; at most 3, each at most 128 characters" }
        - { name: interface.brandColor, type: string, required: false, use: "brand color" }
        - { name: interface.composerIcon, type: string, required: false, use: "composer icon path" }
        - { name: interface.logo, type: string, required: false, use: "logo path" }
        - { name: interface.logoDark, type: string, required: false, use: "dark logo path" }
        - { name: interface.screenshots, type: "string[]", required: false, use: "screenshot paths" }
        - { name: "extensions[\"com.openai\"].onboardingSkill", type: string, required: false, use: "path to a packaged SKILL.md run as setup after install" }
    since: null
    until: null
    observed: "2026-11-05"
    source: codex-source
    locator: "codex-rs/core-plugins/src/manifest.rs:48-121, 289-392, 540-555; codex-rs/exec-server-protocol/src/protocol.rs:55-59 at a037e65ead8f6789f960e9450bfe6af5a87a0053"
    evidence: source
  - value: { overlay_rule: "an extensions.com.openai object replaces the whole .codex-plugin/plugin.json overlay; the two are not merged" }
    since: null
    until: null
    observed: "2026-11-05"
    source: openai-plugin-build
    locator: "Add OpenAI-specific metadata"
    evidence: docs
open:
  - question: "The plugin submission docs mark version, description, author.name, interface, interface.capabilities, interface.composerIcon and interface.logo as required in the Codex format, and list fields the CLI parser never reads (interface.supportURL, brandColorDark, composerIconDark, id, review.*, publication.*). The CLI loader treats every one of them as optional or ignores it. Are those requirements enforced anywhere a CLI user would meet them, or only at directory upload?"
    observed: "2026-11-05"
    source: openai-plugin-submission
sources:
  - id: codex-source
    resource: "https://github.com/openai/codex/tree/a037e65ead8f6789f960e9450bfe6af5a87a0053/codex-rs/core-plugins/src"
    title: "openai/codex core-plugins source at a037e65"
  - id: openai-plugin-build
    resource: "https://developers.openai.com/codex/plugins/build.md"
    title: "OpenAI docs: Package your plugin"
  - id: openai-plugin-submission
    resource: "https://developers.openai.com/plugins/deploy/submission.md"
    title: "OpenAI docs: Upload and submit your plugin"
---

What the sources say about [Plugin manifest fields](/subjects/plugins/manifest-fields.md) in
[Codex CLI](/harnesses/codex.md).

Codex reads two manifest formats. A root `plugin.json` that declares the Agent Plugins schema wins.
Otherwise Codex reads `.codex-plugin/plugin.json`, then `.claude-plugin/plugin.json`, then
`.cursor-plugin/plugin.json`, all with one field set.

## Observations

- 2026-11-05: file: `plugin.json` (Agent Plugins format); fields: $schema (string, required), name
  (string, required), version, description, author.name, author.email, author.url, homepage,
  repository, license, keywords, extensions, `extensions["com.openai"]` and its onboardingSkill.
  Skills come from `skills`, MCP servers from `mcp.json`.[^codex-source]

  ```rust
  const AGENT_PLUGIN_FIELDS: &[&str] = &[
      "$schema",
      "name",
      "version",
      "description",
      "author",
      "homepage",
      "repository",
      "license",
      "keywords",
      "extensions",
  ];
  ...
  struct RawAgentPluginAuthor {
      #[serde(default)]
      name: Option<String>,
      #[serde(default, rename = "email")]
      _email: Option<String>,
      #[serde(default, rename = "url")]
      _url: Option<String>,
  }
  ...
              skills: Some(RawPluginManifestPaths::Path("./skills".to_string())),
              mcp_servers: Some(RawPluginManifestMcpServers::Path("./mcp.json".to_string())),
  ```

- 2026-11-05: legacy file: `.codex-plugin/plugin.json` (also `.claude-plugin/plugin.json`,
  `.cursor-plugin/plugin.json`); fields: name, version, description, keywords, skills, commands,
  mcpServers, apps, hooks, the fifteen `interface.*` keys, and
  `extensions["com.openai"].onboardingSkill`. None is required: an empty name falls back to the
  directory name.[^codex-source]

  ```rust
  struct RawPluginManifest {
      #[serde(default)]
      name: String,
      #[serde(default)]
      version: Option<String>,
      #[serde(default)]
      description: Option<String>,
      #[serde(default)]
      keywords: Vec<String>,
      ...
      skills: Option<RawPluginManifestPaths>,
      #[serde(default)]
      mcp_servers: Option<RawPluginManifestMcpServers>,
      #[serde(default)]
      apps: Option<String>,
      #[serde(default)]
      hooks: Option<RawPluginManifestHooks>,
      #[serde(default)]
      interface: Option<RawPluginManifestInterface>,
      #[serde(default)]
      extensions: JsonValue,
  }

  struct RawPluginCommandManifest {
      #[serde(default)]
      commands: Option<RawPluginManifestPaths>,
  }

  struct RawPluginManifestInterface {
      display_name, short_description, long_description, developer_name, category,
      capabilities, website_url (alias "websiteURL"), privacy_policy_url (alias
      "privacyPolicyURL"), terms_of_service_url (alias "termsOfServiceURL"), default_prompt,
      brand_color, composer_icon, logo, logo_dark, screenshots
  }
  ```

- 2026-11-05: overlay rule: an `extensions.com.openai` object replaces the whole
  `.codex-plugin/plugin.json` overlay; the two are not merged.[^openai-plugin-build]

  > When `extensions.com.openai` is an object, it replaces the entire
  > `.codex-plugin/plugin.json` overlay as the source of OpenAI-specific settings;
  > the two aren't merged.

## Open questions

- The submission docs mark version, description, author.name, interface and several interface keys
  as required in the Codex format, and list keys the CLI parser never reads, such as
  `interface.supportURL`, `brandColorDark`, `composerIconDark`, `id`, `review.*` and
  `publication.*`. The CLI loader treats all of them as optional or ignores them. This is a
  conflict between the docs and the code; it may only apply at directory upload.[^openai-plugin-submission]

  > | `version`     | Required for Codex; optional in the portable schema | ...
  > | `author`      | Required for Codex; optional for Agent Plugins      | ... the Codex format requires `author.name`. ...

[^codex-source]: openai/codex core-plugins source at a037e65
[^openai-plugin-build]: OpenAI docs: Package your plugin
[^openai-plugin-submission]: OpenAI docs: Upload and submit your plugin
