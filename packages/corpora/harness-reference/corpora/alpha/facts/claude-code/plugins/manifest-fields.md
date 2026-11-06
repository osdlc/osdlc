---
type: Harness Fact
title: "Claude Code: Plugin manifest fields"
description: "Plugin manifest fields in Claude Code, as observed over time."
tags: [plugins]
harness: claude-code
subject: plugins/manifest-fields
observations:
  - value:
      file: .claude-plugin/plugin.json
      fields:
        - { name: $schema, type: string, required: false, use: "JSON Schema URL for editor autocomplete; ignored at load time" }
        - { name: name, type: string, required: true, use: "plugin id; every component is namespaced under it" }
        - { name: displayName, type: string, required: false, use: "shown in the UI in place of name; a marketplace entry's displayName wins" }
        - { name: version, type: string, required: false, use: "keeps users on that version until it changes; not checked against semver" }
        - { name: description, type: string, required: false, use: "short explanation of what the plugin provides" }
        - { name: author, type: object, required: false, use: "author details" }
        - { name: author.name, required: "conditional", use: "not documented", note: "Required when author is set." }
        - { name: author.email, required: false, use: "not documented" }
        - { name: author.url, required: false, use: "not documented" }
        - { name: homepage, type: string, required: false, use: "documentation URL; must parse as a URL or the plugin fails to load" }
        - { name: repository, type: string, required: false, use: "source repository URL; not validated" }
        - { name: license, type: string, required: false, use: "SPDX identifier" }
        - { name: keywords, type: "string[]", required: false, use: "discovery tags" }
        - { name: metadata, type: object, required: false, use: "free-form data for the author; Claude Code does not read it", note: "Requires v2.1.222 or later." }
        - { name: icon, type: string, required: false, use: "listing icon in Anthropic's directory; Claude Code does not read it" }
        - { name: documentationUrl, type: string, required: false, use: "listing link in Anthropic's directory; Claude Code does not read it" }
        - { name: supportUrl, type: string, required: false, use: "listing link in Anthropic's directory; Claude Code does not read it" }
        - { name: privacyPolicyUrl, type: string, required: false, use: "listing link in Anthropic's directory; Claude Code does not read it" }
        - { name: termsOfServiceUrl, type: string, required: false, use: "listing link in Anthropic's directory; Claude Code does not read it" }
        - { name: defaultEnabled, type: boolean, required: false, use: "whether the plugin starts enabled when the user has not set it; default true" }
        - { name: dependencies, type: "(string | object)[]", required: false, use: "plugins that must be enabled for this one to work" }
        - { name: settings, type: object, required: false, use: "settings applied while enabled; only agent and subagentStatusLine take effect" }
        - { name: userConfig, type: object, required: false, use: "values the user is prompted for when the plugin is enabled" }
        - { name: "userConfig.<key>.type", required: true, use: "one of string, number, boolean, directory, file" }
        - { name: "userConfig.<key>.title", required: true, use: "label in the configuration dialog" }
        - { name: "userConfig.<key>.description", required: true, use: "help text beneath the field" }
        - { name: "userConfig.<key>.required", required: false, use: "dialog refuses an empty value" }
        - { name: "userConfig.<key>.default", type: "string | number | boolean | string[]", required: false, use: "value used when the user gives none" }
        - { name: "userConfig.<key>.options", required: false, use: "fixed values for a string field, shown as a picker", note: "Requires v2.1.271 or later." }
        - { name: "userConfig.<key>.multiple", required: false, use: "lets a string field hold an array of strings" }
        - { name: "userConfig.<key>.sensitive", required: false, use: "masks input and stores the value in secure storage" }
        - { name: "userConfig.<key>.min", required: false, use: "lower bound for a number" }
        - { name: "userConfig.<key>.max", required: false, use: "upper bound for a number" }
        - { name: types, type: path, required: false, use: "a .d.ts file declaring a mod's state values and nouns" }
        - { name: channels, type: "object[]", required: false, use: "message channels, each bound to one of the plugin's MCP servers" }
        - { name: "channels[].server", required: true, use: "key of the MCP server the channel binds to" }
        - { name: "channels[].displayName", required: false, use: "configuration dialog title; defaults to the server name" }
        - { name: "channels[].userConfig", type: object, required: false, use: "options to prompt for, same shape as userConfig" }
        - { name: skills, type: "path | path[]", required: false, use: "skill directories; adds to the default skills scan" }
        - { name: commands, type: "path | path[] | object", required: false, use: "command files, directories, or a name-to-source/content map; replaces the default commands scan" }
        - { name: agents, type: "path | path[]", required: false, use: "agent .md files; replaces the default agents scan" }
        - { name: hooks, type: "path | object | (path | object)[]", required: false, use: "hook files or inline hook config; loaded together with hooks/hooks.json" }
        - { name: mcpServers, type: "path | object | (path | object)[]", required: false, use: "MCP config files, .mcpb or .dxt bundles, or inline servers; loaded together with .mcp.json" }
        - { name: lspServers, type: "path | object | (path | object)[]", required: false, use: "LSP config files or inline servers; loaded together with .lsp.json" }
        - { name: outputStyles, type: "path | path[]", required: false, use: "output style files or directories; replaces the default output-styles scan" }
        - { name: workflows, type: "path | path[]", required: false, use: "workflow .js files or directories; replaces the default workflows scan" }
        - { name: experimental, type: object, required: false, use: "container for themes, monitors and evals, whose shape may still change" }
        - { name: experimental.themes, type: "path | path[]", required: false, use: "theme files or directories; replaces the default themes scan" }
        - { name: experimental.monitors, type: "path | array", required: false, use: "monitors file or inline array; default monitors/monitors.json" }
        - { name: experimental.evals, type: "path | path[]", required: false, use: "eval case directory when it is not evals" }
        - { name: themes, type: "path | path[]", required: false, use: "old spelling of experimental.themes; still loads, with a validate warning" }
        - { name: monitors, type: "path | array", required: false, use: "old spelling of experimental.monitors; still loads, with a validate warning" }
    since: null
    until: null
    observed: "2026-11-05"
    source: claude-plugins-reference
    locator: "Fields; User configuration; Channels"
    evidence: docs
    note: "The page is titled Plugin manifest reference. A marketplace entry can also carry every field here except the five directory listing fields."
sources:
  - id: claude-plugins-reference
    resource: "https://code.claude.com/docs/en/plugins-reference.md"
    title: "Claude Code docs: Plugin manifest reference"
---

What the sources say about [Plugin manifest fields](/subjects/plugins/manifest-fields.md) in
[Claude Code](/harnesses/claude-code.md).

## Observations

- 2026-11-05: file: `.claude-plugin/plugin.json`; fields: `$schema`, `name` (string, the only
  required key), `displayName`, `version`, `description`, `author` (`name` required inside it,
  `email`, `url`), `homepage`, `repository`, `license`, `keywords`, `metadata`, the directory
  listing fields `icon`, `documentationUrl`, `supportUrl`, `privacyPolicyUrl`, `termsOfServiceUrl`,
  `defaultEnabled`, `dependencies`, `settings`, `userConfig` (per-option `type`, `title`,
  `description`, `required`, `default`, `options`, `multiple`, `sensitive`, `min`, `max`), `types`,
  `channels` (`server`, `displayName`, `userConfig`), the component keys `skills`, `commands`,
  `agents`, `hooks`, `mcpServers`, `lspServers`, `outputStyles`, `workflows`, and `experimental`
  (`themes`, `monitors`, `evals`). Top-level `themes` and `monitors` still load.[^claude-plugins-reference]

  > Save the manifest at `.claude-plugin/plugin.json` under the plugin root.

  > The table lists the top-level keys in `plugin.json`. `name` is the only required key.

  > | `author` | Object | `name`, which is required, plus optional `email` and `url` |
  > | `homepage` | String | Documentation URL. Must parse as a URL, or the plugin fails to load |
  > | `repository` | String | Source repository URL. Not validated |
  > | [`metadata`](#metadata) | Object | Free-form object for your own data. Claude Code doesn't read it |
  > | [`icon`](#directory-listing-fields) | String | Icon for the plugin's listing in Anthropic's directory. Claude Code doesn't read it |
  > | [`settings`](#settings) | Object | Settings Claude Code applies while the plugin is enabled. Only `agent` and `subagentStatusLine` take effect |
  > | `skills` | Path, or array of paths | Directories to scan for skills, ... Adds to the default `skills/` scan |
  > | `agents` | Path, or array of paths | Agent `.md` files. Directories aren't accepted. Replaces the default `agents/` scan |
  > | `experimental.themes` | Path, or array of paths | Theme files or directories. Replaces the default `themes/` scan. A top-level `themes` key still loads, with a `claude plugin validate` warning |

  > | `type` | Yes | One of `string`, `number`, `boolean`, `directory`, or `file` |
  > | `title` | Yes | Label shown in the configuration dialog |
  > | `description` | Yes | Help text shown beneath the field |

  > | `server` | Yes | Key of the MCP server in this plugin's `mcpServers` that the channel binds to |

  > A [marketplace entry](https://code.claude.com/docs/en/plugins/marketplace-reference.md) accepts [its own fields](https://code.claude.com/docs/en/plugins/marketplace-reference.md#plugin-entries), including `strict`, and every field on this page except the [directory listing fields](#directory-listing-fields).

[^claude-plugins-reference]: Claude Code docs: Plugin manifest reference
