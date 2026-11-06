---
type: Harness Fact
title: "Copilot CLI: Marketplace fields"
description: "Marketplace fields in Copilot CLI, as observed over time."
tags: [plugins]
harness: copilot-cli
subject: plugins/marketplace-fields
observations:
  - value:
      file: .github/plugin/marketplace.json
      files_checked: [marketplace.json, .plugin/marketplace.json, .github/plugin/marketplace.json, .claude-plugin/marketplace.json]
      fields:
        - { name: name, type: string, required: true, use: "kebab-case marketplace name, at most 64 characters; becomes the registration key and the part after @ in a plugin id" }
        - { name: owner, type: object, required: true, use: "marketplace owner info" }
        - { name: owner.name, required: true, use: "not documented" }
        - { name: owner.email, required: false, use: "not documented" }
        - { name: plugins, type: array, required: true, use: "plugin entries" }
        - { name: metadata, type: object, required: false, use: "not documented" }
        - { name: metadata.description, required: false, use: "not documented" }
        - { name: metadata.version, required: false, use: "not documented" }
        - { name: metadata.pluginRoot, required: false, use: "not documented" }
      entry_fields:
        - { name: name, type: string, required: true, use: "kebab-case plugin name, at most 64 characters; dots allowed for Agent Plugins plugins" }
        - { name: source, type: "string | object", required: true, use: "where to fetch the plugin" }
        - { name: description, type: string, required: false, use: "plugin description; at most 1024 characters" }
        - { name: version, type: string, required: false, use: "plugin version" }
        - { name: author, type: object, required: false, use: "{ name, email?, url? }" }
        - { name: homepage, type: string, required: false, use: "plugin homepage URL" }
        - { name: repository, type: string, required: false, use: "source repository URL" }
        - { name: license, type: string, required: false, use: "license identifier" }
        - { name: keywords, type: "string[]", required: false, use: "search keywords" }
        - { name: category, type: string, required: false, use: "plugin category" }
        - { name: tags, type: "string[]", required: false, use: "additional tags" }
        - { name: commands, type: "string | string[]", required: false, use: "command directories" }
        - { name: agents, type: "string | string[]", required: false, use: "agent directories" }
        - { name: skills, type: "string | string[]", required: false, use: "skill directories" }
        - { name: hooks, type: "string | object", required: false, use: "hooks config path or inline hooks object" }
        - { name: mcpServers, type: "string | object", required: false, use: "MCP servers to activate on install, when the plugin ships no MCP config of its own" }
        - { name: lspServers, type: "string | object", required: false, use: "LSP config path or inline server definitions" }
        - { name: strict, type: boolean, required: false, use: "default true, full schema and validation rules; false relaxes validation" }
      source_forms: ["relative path (string; the leading dot-slash is optional)", "github (repo, ref, sha, path)", "url (ref, sha, path)"]
    since: null
    until: null
    observed: "2026-11-05"
    source: copilot-cli-plugin-reference
    locator: "content/copilot/reference/copilot-cli-reference/cli-plugin-reference.md:303-385, 394 at 17d6ee52f965e7c46f74b4339d5fa1ad6f4f4493"
    evidence: docs
    note: "files_checked is the search order. The page shows only github source objects; it says url takes sha as well, but does not list the url form's own keys."
  - value:
      source_path_rule: "a source path is relative to the repository root; plugins/x and the dot-slash spelling resolve to the same directory"
    since: null
    until: null
    observed: "2026-11-05"
    source: copilot-cli-path-reusable
    locator: "data/reusables/copilot/copilot-cli/cli-path-to-plugins.md:1 at 17d6ee52f965e7c46f74b4339d5fa1ad6f4f4493"
    evidence: docs
open:
  - question: "What keys does a url source object take besides ref, sha and path? The page names the url type but shows only github objects."
    observed: "2026-11-05"
    source: copilot-cli-plugin-reference
sources:
  - id: copilot-cli-plugin-reference
    resource: "https://github.com/github/docs/blob/17d6ee52f965e7c46f74b4339d5fa1ad6f4f4493/content/copilot/reference/copilot-cli-reference/cli-plugin-reference.md"
    title: "GitHub Docs: GitHub Copilot CLI plugin reference"
  - id: copilot-cli-path-reusable
    resource: "https://github.com/github/docs/blob/17d6ee52f965e7c46f74b4339d5fa1ad6f4f4493/data/reusables/copilot/copilot-cli/cli-path-to-plugins.md"
    title: "GitHub Docs reusable: path to plugins"
---

What the sources say about [Marketplace fields](/subjects/plugins/marketplace-fields.md) in
[Copilot CLI](/harnesses/copilot-cli.md).

## Observations

- 2026-11-05: file: `.github/plugin/marketplace.json` (also `marketplace.json`,
  `.plugin/marketplace.json`, `.claude-plugin/marketplace.json`); top-level fields: `name`,
  `owner` (`name`, `email`), `plugins` (all required), `metadata` (`description`, `version`,
  `pluginRoot`); entry fields: `name`, `source` (required), `description`, `version`, `author`,
  `homepage`, `repository`, `license`, `keywords`, `category`, `tags`, `commands`, `agents`,
  `skills`, `hooks`, `mcpServers`, `lspServers`, `strict`; source forms: relative path, `github`,
  `url`.[^copilot-cli-plugin-reference]

  > You can create a plugin marketplace—which people can use to discover and install your plugins—by creating a `marketplace.json` file and saving it to the `.github/plugin/` directory of the repository.

  > | `name`     | string   | Yes      | Kebab-case marketplace name. Max 64 chars. Dots are also accepted (for example, `acme.tools`) for [Agent Plugins 1.0](#agent-plugins-10-manifest-fields) plugins. |
  > | `owner`    | object   | Yes      | `{ name, email? }` — marketplace owner info. |
  > | `plugins`  | array    | Yes      | List of plugin entries (see the table below). |
  > | `metadata` | object   | No       | `{ description?, version?, pluginRoot? }` |

  > | `source`      | string \| object   | Yes      | Where to fetch the plugin (relative path, {% data variables.product.github %}, or URL). |
  > | `mcpServers`  | string \| object   | No       | MCP servers to activate when the plugin is installed. ... Used when the plugin source does not ship its own MCP configuration. |
  > | `strict`      | boolean            | No       | When `true` (the default), plugins must conform to the full schema and validation rules. When `false`, relaxed validation is used, ...

  > Both the `github` and `url` source types accept an optional `sha` field to pin installs to an exact commit, in addition to (or instead of) `ref`:

  > | Marketplace manifest | `marketplace.json`, `.plugin/marketplace.json`, `.github/plugin/marketplace.json`, or `.claude-plugin/marketplace.json` (checked in this order) |

- 2026-11-05: a relative source needs no leading `./`.[^copilot-cli-path-reusable]

  > The value of the `source` field for each plugin is the path to the plugin's directory, relative to the root of the repository. It is not necessary to use `./` at the start of the path.

## Open questions

- The keys of a `url` source object beyond `ref`, `sha` and `path`.[^copilot-cli-plugin-reference]

[^copilot-cli-plugin-reference]: GitHub Docs: GitHub Copilot CLI plugin reference
[^copilot-cli-path-reusable]: GitHub Docs reusable: path to plugins
