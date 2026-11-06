---
type: Harness Fact
title: "Copilot CLI: Plugin manifest fields"
description: "Plugin manifest fields in Copilot CLI, as observed over time."
tags: [plugins]
harness: copilot-cli
subject: plugins/manifest-fields
observations:
  - value:
      file: plugin.json
      fields:
        - { name: $schema, type: string, required: true, use: "must be the Agent Plugins 1.0.0 or 1.1.0 schema URL; opts the plugin into Agent Plugins semantics; an unsupported version is rejected" }
        - { name: name, type: string, required: true, use: "plugin name; 1-64 lowercase letters, digits, hyphens and periods, no -- or .." }
        - { name: version, type: string, required: false, use: "version string; semver recommended" }
        - { name: description, type: string, required: false, use: "brief description" }
        - { name: author, type: object, required: false, use: "optional name, email and url strings" }
        - { name: author.name, type: string, required: false, use: "not documented" }
        - { name: author.email, type: string, required: false, use: "not documented" }
        - { name: author.url, type: string, required: false, use: "not documented" }
        - { name: homepage, type: string, required: false, use: "plugin homepage or documentation" }
        - { name: repository, type: string, required: false, use: "source repository" }
        - { name: license, type: string, required: false, use: "license identifier; SPDX recommended" }
        - { name: keywords, type: "string[]", required: false, use: "search and discovery keywords" }
        - { name: extensions, type: object, required: false, use: "client-specific data keyed by reverse-domain namespace" }
    since: null
    until: null
    observed: "2026-11-05"
    source: copilot-cli-plugin-reference
    locator: "content/copilot/reference/copilot-cli-reference/cli-plugin-reference.md:119-144 at 17d6ee52f965e7c46f74b4339d5fa1ad6f4f4493"
    evidence: docs
    note: "The Agent Plugins format. Component paths are fixed (skills, mcp.json, and com.github.copilot for agents, commands, rules, hooks and LSP) and cannot be set in the manifest."
  - value:
      legacy_files: [.plugin/plugin.json, plugin.json, .github/plugin/plugin.json, .claude-plugin/plugin.json]
      legacy_fields:
        - { name: name, type: string, required: true, use: "kebab-case plugin name, letters, numbers and hyphens; at most 64 characters" }
        - { name: description, type: string, required: false, use: "brief description; at most 1024 characters" }
        - { name: version, type: string, required: false, use: "semantic version" }
        - { name: author, type: object, required: false, use: "author details" }
        - { name: author.name, required: "conditional", use: "not documented", note: "Required when author is set." }
        - { name: author.email, required: false, use: "not documented" }
        - { name: author.url, required: false, use: "not documented" }
        - { name: homepage, type: string, required: false, use: "plugin homepage URL" }
        - { name: repository, type: string, required: false, use: "source repository URL" }
        - { name: license, type: string, required: false, use: "license identifier" }
        - { name: keywords, type: "string[]", required: false, use: "search keywords" }
        - { name: category, type: string, required: false, use: "plugin category" }
        - { name: tags, type: "string[]", required: false, use: "additional tags" }
        - { name: agents, type: "string | string[]", required: false, use: "agent directories (.agent.md files); default agents" }
        - { name: skills, type: "string | string[]", required: false, use: "skill directories; default skills" }
        - { name: commands, type: "string | string[]", required: false, use: "command directories" }
        - { name: hooks, type: "string | object", required: false, use: "hooks config file, or an inline hooks object" }
        - { name: extensions, type: "string | string[] | object", required: false, use: "extension directories; { paths, exclusive: true } suppresses built-in extensions" }
        - { name: mcpServers, type: "string | object", required: false, use: "MCP config file, or inline server definitions" }
        - { name: lspServers, type: "string | object", required: false, use: "LSP config file, or inline server definitions" }
    since: null
    until: null
    observed: "2026-11-05"
    source: copilot-cli-plugin-reference
    locator: "content/copilot/reference/copilot-cli-reference/cli-plugin-reference.md:184-216, 387-394 at 17d6ee52f965e7c46f74b4339d5fa1ad6f4f4493"
    evidence: docs
    note: "The legacy Copilot format: any manifest without a recognized Agent Plugins $schema. legacy_files is the search order. extensions means something different here than in an Agent Plugins manifest."
sources:
  - id: copilot-cli-plugin-reference
    resource: "https://github.com/github/docs/blob/17d6ee52f965e7c46f74b4339d5fa1ad6f4f4493/content/copilot/reference/copilot-cli-reference/cli-plugin-reference.md"
    title: "GitHub Docs: GitHub Copilot CLI plugin reference"
---

What the sources say about [Plugin manifest fields](/subjects/plugins/manifest-fields.md) in
[Copilot CLI](/harnesses/copilot-cli.md).

Copilot CLI reads two manifest formats. The `$schema` value picks the format.

## Observations

- 2026-11-05: Agent Plugins format: file: `plugin.json` at the plugin root; fields: `$schema` and
  `name` (required), `version`, `description`, `author` (`name`, `email`, `url`), `homepage`,
  `repository`, `license`, `keywords`, `extensions`.[^copilot-cli-plugin-reference]

  > {% data variables.copilot.copilot_cli_short %} recognizes the canonical `$schema` values for Agent Plugins (Open Plugin Spec) v1.0.0 (`https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`) and v1.1.0 (`https://agent-plugins.org/schemas/1.1.0/plugin.schema.json`), opting a plugin into Agent Plugins semantics. A manifest without one of these exact values uses the legacy format and loads as before.

  > | `$schema`     | string   | Yes | Must be a recognized Agent Plugins `$schema` URL (v1.0.0 or v1.1.0). Unsupported Agent Plugins versions are rejected. |
  > | `name`        | string   | Yes | Plugin name. See [Name constraints](#name-constraints). |
  > | `author`      | object   | No | Optional `name`, `email`, and `url` string fields. |
  > | `extensions`  | object   | No | Client-specific data keyed by reverse-domain namespace. |

- 2026-11-05: legacy format: files `.plugin/plugin.json`, `plugin.json`,
  `.github/plugin/plugin.json`, `.claude-plugin/plugin.json`; fields: `name` (required),
  `description`, `version`, `author` (`name` required, `email`, `url`), `homepage`, `repository`,
  `license`, `keywords`, `category`, `tags`, and the component paths `agents`, `skills`,
  `commands`, `hooks`, `extensions`, `mcpServers`, `lspServers`.[^copilot-cli-plugin-reference]

  > | `name`  | string | Kebab-case plugin name (letters, numbers, and hyphens only). Maximum 64 characters. |

  > | `description`| string    | Brief description. Max 1024 chars. |
  > | `author`     | object    | `name` (required), `email` (optional), `url` (optional). |
  > | `category`   | string    | Plugin category. |
  > | `tags`       | string[]  | Additional tags. |

  > | `agents`    | string \| string[] | `agents/`  | Path(s) to agent directories (`.agent.md` files). |
  > | `extensions`| string \| string[] \| object | —          | Path(s) to extension directories. Use `{ paths: [...], exclusive: true }` to suppress built-in extensions. In [Agent Plugins 1.0 manifests](#agent-plugins-10-manifest-fields), this field has a different meaning. |
  > | `lspServers`| string \| object   | —          | Path to an LSP configuration file, or inline server definitions. |

  > Legacy plugins: `.plugin/plugin.json`, `plugin.json`, `.github/plugin/plugin.json`, or `.claude-plugin/plugin.json` (checked in this order).

[^copilot-cli-plugin-reference]: GitHub Docs: GitHub Copilot CLI plugin reference
