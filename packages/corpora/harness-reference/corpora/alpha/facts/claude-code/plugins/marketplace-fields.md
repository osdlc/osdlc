---
type: Harness Fact
title: "Claude Code: Marketplace fields"
description: "Marketplace fields in Claude Code, as observed over time."
tags: [plugins]
harness: claude-code
subject: plugins/marketplace-fields
observations:
  - value:
      file: .claude-plugin/marketplace.json
      fields:
        - { name: name, type: string, required: true, use: "marketplace id; typed after @ in a plugin id" }
        - { name: owner, type: object, required: true, use: "maintainer information" }
        - { name: owner.name, required: true, use: "maintainer name" }
        - { name: owner.email, required: false, use: "not documented" }
        - { name: owner.url, required: false, use: "not documented" }
        - { name: plugins, type: array, required: true, use: "plugin entries; each is validated on its own" }
        - { name: $schema, type: string, required: false, use: "JSON Schema URL for editor autocomplete; ignored at load time" }
        - { name: description, type: string, required: false, use: "marketplace description shown to users; validate warns when missing" }
        - { name: version, type: string, required: false, use: "marketplace manifest version" }
        - { name: metadata.description, type: string, required: false, use: "alternate location for description" }
        - { name: metadata.version, type: string, required: false, use: "alternate location for version" }
        - { name: metadata.pluginRoot, type: string, required: false, use: "directory bare plugin source names resolve under", note: "Requires v2.1.239 or later." }
        - { name: forceRemoveDeletedPlugins, type: boolean, required: false, use: "uninstalls a plugin removed from plugins on users' machines" }
        - { name: allowCrossMarketplaceDependenciesOn, type: "string[]", required: false, use: "marketplaces whose plugins may be installed as dependencies" }
        - { name: renames, type: object, required: false, use: "map from a former plugin name to its current name, or null for a removed plugin" }
      entry_fields:
        - { name: name, type: string, required: true, use: "plugin id typed before @ at install, even when plugin.json sets another name" }
        - { name: source, type: "string | object", required: true, use: "where to fetch the plugin" }
        - { name: description, type: string, required: false, use: "shown in /plugin listings and details" }
        - { name: version, type: string, required: false, use: "plugin version; a version in plugin.json wins and validate warns" }
        - { name: category, type: string, required: false, use: "free-form category for organizing the catalog" }
        - { name: tags, type: "string[]", required: false, use: "free-form tags for search" }
        - { name: strict, type: boolean, required: false, use: "default true; whether plugin.json is the definitive source of components" }
        - { name: relevance, type: object, required: false, use: "signals for when to suggest the plugin", note: "Validation message names its keys topic and signals." }
        - { name: dependencies, type: array, required: false, use: "plugins that must be enabled for this one to work" }
        - { name: defaultEnabled, type: boolean, required: false, use: "default true; the entry value wins over plugin.json" }
        - { name: displayName, type: string, required: false, use: "name shown in the UI; wins over plugin.json" }
        - { name: metadata, type: object, required: false, use: "free-form; Claude Code does not read it", note: "Requires v2.1.222 or later." }
        - { name: headers, type: object, required: false, use: "HTTP headers sent when downloading an archive source", note: "Requires v2.1.238 or later." }
        - { name: headersHelper, type: string, required: false, use: "command that prints archive-download headers; entry must set strict false", note: "Requires v2.1.238 or later." }
        - { name: author, type: object, required: false, use: "display field; the entry value wins over plugin.json" }
        - { name: homepage, type: string, required: false, use: "display field; the entry value wins over plugin.json" }
        - { name: repository, type: string, required: false, use: "display field; the entry value wins over plugin.json" }
        - { name: license, type: string, required: false, use: "display field; the entry value wins over plugin.json" }
        - { name: keywords, type: "string[]", required: false, use: "display field; the entry value wins over plugin.json" }
        - { name: commands, type: "as in plugin.json", required: false, use: "component field; appended to plugin.json under strict true, a conflict under strict false" }
        - { name: agents, type: "as in plugin.json", required: false, use: "component field; appended to plugin.json under strict true, a conflict under strict false" }
        - { name: skills, type: "as in plugin.json", required: false, use: "component field; appended to plugin.json under strict true, a conflict under strict false" }
        - { name: hooks, type: object, required: false, use: "component field; only the inline object form runs; its matchers replace the manifest's per event" }
        - { name: outputStyles, type: "as in plugin.json", required: false, use: "component field; appended to plugin.json under strict true, a conflict under strict false" }
        - { name: themes, type: "as in plugin.json", required: false, use: "component field; appended to plugin.json under strict true, a conflict under strict false" }
        - { name: mcpServers, type: "as in plugin.json", required: false, use: "applies only when the plugin has no plugin.json" }
        - { name: lspServers, type: "as in plugin.json", required: false, use: "applies only when the plugin has no plugin.json" }
        - { name: userConfig, type: "as in plugin.json", required: false, use: "applies only when the plugin has no plugin.json" }
        - { name: channels, type: "as in plugin.json", required: false, use: "applies only when the plugin has no plugin.json" }
        - { name: experimental, type: object, required: false, use: "component declarations; a non-object is ignored with a warning" }
      source_forms: ["relative path (string)", "github (repo, ref, sha)", "url (url, ref, sha)", "git-subdir (url, path, ref, sha)", "npm (package, version, registry)", "archive (url, sha256)", "command (command, timeout, mode)"]
    since: null
    until: null
    observed: "2026-11-05"
    source: claude-marketplace-reference
    locator: "Top-level fields; Plugin entries; How an entry combines with plugin.json; Plugin sources"
    evidence: docs
    note: "An entry accepts every plugin.json field except the directory listing fields; the list names those the page discusses. archive needs v2.1.224 or later, command v2.1.229 or later."
sources:
  - id: claude-marketplace-reference
    resource: "https://code.claude.com/docs/en/plugins/marketplace-reference.md"
    title: "Claude Code docs: Marketplace reference"
---

What the sources say about [Marketplace fields](/subjects/plugins/marketplace-fields.md) in
[Claude Code](/harnesses/claude-code.md).

## Observations

- 2026-11-05: file: `.claude-plugin/marketplace.json`; top-level fields: `name`, `owner`
  (`name` required, `email`, `url`) and `plugins` (all three required), `$schema`, `description`,
  `version`, `metadata.description`, `metadata.version`, `metadata.pluginRoot`,
  `forceRemoveDeletedPlugins`, `allowCrossMarketplaceDependenciesOn`, `renames`; entry fields:
  `name` and `source` (required), `description`, `version`, `category`, `tags`, `strict`,
  `relevance`, `dependencies`, `defaultEnabled`, `displayName`, `metadata`, `headers`,
  `headersHelper`, plus every `plugin.json` field except the directory listing fields; source
  forms: relative path, `github`, `url`, `git-subdir`, `npm`, `archive`, `command`.[^claude-marketplace-reference]

  > Save the marketplace file at `.claude-plugin/marketplace.json` in your marketplace's directory.

  > The table lists every key Claude Code reads from `marketplace.json`. `name`, `owner`, and `plugins` are required.

  > | `owner` | object | Maintainer information. `name` is required; `email` and `url` are optional |
  > | `metadata.pluginRoot` | string | Directory that bare plugin source names resolve under. ... Requires Claude Code v2.1.239 or later |
  > | `renames` | object | Map from a former plugin `name` to its current name, or to `null` for a plugin you removed. ...

  > Each object in the top-level `plugins` array of `marketplace.json` names a plugin and says where to fetch it. `name` and `source` are required.

  > Apart from the [directory listing fields](https://code.claude.com/docs/en/plugins/manifest-reference.md#directory-listing-fields), an entry also accepts every [`plugin.json` field](https://code.claude.com/docs/en/plugins/manifest-reference), such as `description`, `version`, `author`, `commands`, and `hooks`.

  > * **`plugin.json` present**: `plugin.json` is the manifest. [Strict mode](#strict-mode) decides whether the entry's six component fields, `commands`, `agents`, `skills`, `hooks`, `outputStyles`, and `themes`, are combined with it or rejected as a conflict. Entry `mcpServers`, `lspServers`, `userConfig`, and `channels` don't apply. Declare them in `plugin.json`.

  > | `github` | `repo`, `ref`, `sha` | GitHub repository in `owner/repo` form |
  > | `git-subdir` | `url`, `path`, `ref`, `sha` | One subdirectory of a git repository, fetched with a sparse checkout |
  > | `npm` | `package`, `version`, `registry` | npm registry package or tarball link, ...
  > | `archive` | `url`, `sha256` | Zip archive over HTTPS. Requires Claude Code v2.1.224 or later |
  > | `command` | `command`, `timeout`, `mode` | Directory printed by a command Claude Code runs on the user's machine. Requires Claude Code v2.1.229 or later |

  > | `'relevance' must be an object containing topic and signals; got <type>. It will be ignored at load time.` | Warning | `plugins[i].relevance` |

## Open questions

- The docs say an entry takes every `plugin.json` field but list only some. Do `workflows`,
  `settings` and `types` in an entry behave as they do in `plugin.json`?[^claude-marketplace-reference]

[^claude-marketplace-reference]: Claude Code docs: Marketplace reference
