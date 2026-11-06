---
type: Harness Fact
title: "Cursor: Plugin manifest fields"
description: "Plugin manifest fields in Cursor, as observed over time."
tags: [plugins]
harness: cursor
subject: plugins/manifest-fields
observations:
  - value:
      file: .cursor-plugin/plugin.json
      also_loads: plugin.json (Agent Plugins root manifest)
      fields:
        - { name: name, type: string, required: true, use: "plugin id; lowercase kebab-case, alphanumerics, hyphens and periods" }
        - { name: description, type: string, required: false, use: "brief plugin description" }
        - { name: version, type: string, required: false, use: "semantic version" }
        - { name: author, type: object, required: false, use: "author info" }
        - { name: author.name, required: "conditional", use: "not documented", note: "Required when author is set." }
        - { name: author.email, required: false, use: "not documented" }
        - { name: homepage, type: string, required: false, use: "URL to the plugin homepage" }
        - { name: repository, type: string, required: false, use: "URL to the plugin repository" }
        - { name: license, type: string, required: false, use: "license identifier" }
        - { name: keywords, type: array, required: false, use: "tags for discovery and categorization" }
        - { name: logo, type: string, required: false, use: "logo path or absolute URL; relative paths resolve to raw.githubusercontent.com URLs" }
        - { name: rules, type: "string | array", required: false, use: "rule files or directories; replaces folder discovery" }
        - { name: agents, type: "string | array", required: false, use: "agent files or directories; replaces folder discovery" }
        - { name: skills, type: "string | array", required: false, use: "skill directories; replaces folder discovery" }
        - { name: commands, type: "string | array", required: false, use: "command files or directories; replaces folder discovery" }
        - { name: hooks, type: "string | object", required: false, use: "hooks config file, or inline hook config" }
        - { name: mcpServers, type: "string | object | array", required: false, use: "MCP config file, inline servers, or an array of either; overrides mcp.json discovery" }
        - { name: variables, type: object, required: false, use: "JSON Schema naming variables users set in the dashboard; substituted into ${VAR} placeholders" }
    since: null
    until: null
    observed: "2026-11-05"
    source: cursor-plugins-reference
    locator: "Cursor Plugin manifest; Cursor Plugin component discovery"
    evidence: docs
  - value:
      schema_file: .cursor-plugin/plugin.json
      schema_fields:
        - { name: name, type: string, required: true, use: "plugin id in kebab-case" }
        - { name: displayName, type: string, required: false, use: "human-readable display name" }
        - { name: description, type: string, required: false, use: "short description" }
        - { name: version, type: string, required: false, use: "semantic version" }
        - { name: minClientVersions, type: object, required: false, use: "minimum client versions to install, keyed by client id; \"never\" hides the plugin from that client" }
        - { name: minClientVersions.cursor, type: string, required: false, use: "minimum Cursor version, or never" }
        - { name: minClientVersions.grokbot, type: string, required: false, use: "minimum Grok Bot version, or never" }
        - { name: minClientVersions.sand, type: string, required: false, use: "deprecated id for Grok Bot" }
        - { name: author, type: object, required: false, use: "the plugin author" }
        - { name: author.name, type: string, required: "conditional", use: "author name", note: "Required when author is set." }
        - { name: author.email, type: string, required: false, use: "author email address; format email" }
        - { name: publisher, type: string, required: false, use: "publisher or organisation name" }
        - { name: homepage, type: string, required: false, use: "homepage URL; format uri" }
        - { name: repository, type: string, required: false, use: "source repository URL; format uri" }
        - { name: license, type: string, required: false, use: "SPDX license identifier" }
        - { name: logo, type: string, required: false, use: "logo path relative to the plugin root, or an absolute URL" }
        - { name: keywords, type: "string[]", required: false, use: "keywords for discovery and search" }
        - { name: category, type: string, required: false, use: "category for marketplace classification" }
        - { name: tags, type: "string[]", required: false, use: "tags for filtering and discovery" }
        - { name: commands, type: "string | string[]", required: false, use: "globs or paths to command files" }
        - { name: agents, type: "string | string[]", required: false, use: "globs or paths to agent files" }
        - { name: skills, type: "string | string[]", required: false, use: "globs or paths to skill files" }
        - { name: rules, type: "string | string[]", required: false, use: "globs or paths to rule files" }
        - { name: hooks, type: "string | object", required: false, use: "hooks config file, or an inline hooks object" }
        - { name: variables, type: object, required: false, use: "JSON Schema for user-configured plugin variables" }
        - { name: variables.type, type: string, required: "conditional", use: "must be object", note: "Required when variables is set." }
        - { name: variables.properties, type: object, required: false, use: "not documented" }
        - { name: variables.required, type: "string[]", required: false, use: "not documented" }
        - { name: mcpServers, type: "string | object | (string | object)[]", required: false, use: "MCP server config path, inline config, or an array of either" }
    since: null
    until: null
    observed: "2026-11-05"
    source: cursor-plugins-repo
    locator: "schemas/plugin.schema.json:1-196 at 2776ddd2355d6d6c8747d3964600f28daf62f049"
    evidence: source
    note: "The JSON Schema that the official cursor/plugins marketplace repository checks every plugin against in CI. Its $id URL, cursor.com/schemas/cursor-plugin/plugin.json, served an HTML page, not the schema, on 2026-11-05."
open:
  - question: "The docs omit displayName, minClientVersions, publisher, category and tags, which the cursor/plugins schema allows, and the schema omits nothing the docs list. Does the Cursor client read the schema-only fields?"
    observed: "2026-11-05"
    source: cursor-plugins-repo
sources:
  - id: cursor-plugins-reference
    resource: "https://cursor.com/docs/reference/plugins.md"
    title: "Cursor docs: Plugins reference"
  - id: cursor-plugins-repo
    resource: "https://github.com/cursor/plugins/blob/2776ddd2355d6d6c8747d3964600f28daf62f049/schemas/plugin.schema.json"
    title: "cursor/plugins: plugin.schema.json"
---

What the sources say about [Plugin manifest fields](/subjects/plugins/manifest-fields.md) in
[Cursor](/harnesses/cursor.md).

The docs and the schema in Cursor's official plugins repository disagree: the schema allows five
fields the docs do not list. Both are recorded.

## Observations

- 2026-11-05: file: `.cursor-plugin/plugin.json` (a root Agent Plugins `plugin.json` also loads);
  fields: `name` (required), `description`, `version`, `author` (`name` required, `email`),
  `homepage`, `repository`, `license`, `keywords`, `logo`, `rules`, `agents`, `skills`,
  `commands`, `hooks`, `mcpServers`, `variables`.[^cursor-plugins-reference]

  > Every Cursor Plugin requires a `.cursor-plugin/plugin.json` manifest file.

  > | `name` | string | Plugin identifier. Lowercase, kebab-case (alphanumerics, hyphens, and periods). Must start and end with an alphanumeric character. Examples: `my-plugin`, `prompts.chat` |

  > | `author`      | object                   | Author info: `name` (required), `email` (optional) |
  > | `logo`        | string                   | Relative path to a logo file in the repo (e.g., `assets/logo.svg`), or an absolute URL. Relative paths resolve to `raw.githubusercontent.com` URLs. ...
  > | `mcpServers`  | string, object, or array | Path to MCP config file, inline MCP server config, or an array of either. Overrides default `mcp.json` discovery. |
  > | `variables`   | object                   | JSON Schema that declares variable **names** (tokens, connection strings). ... Substituted into `${VAR}` placeholders. ...

  > If a manifest field **is** specified (e.g., `"skills": "./my-skills/"`), it **replaces** folder discovery for that component. The default folder is not also scanned.

- 2026-11-05: schema fields: the docs' fields plus `displayName`, `minClientVersions`,
  `publisher`, `category`, `tags`; closed with `additionalProperties: false`.[^cursor-plugins-repo]

  ```json
  "required": ["name"],
  "additionalProperties": false,
  ...
  "displayName": { "type": "string", "description": "Human-readable display name for the plugin." },
  "minClientVersions": { "$ref": "#/$defs/minClientVersions", "description": "Minimum client versions required to install the plugin, keyed by client identifier." },
  "publisher": { "type": "string", "minLength": 1, "description": "Publisher or organisation name." },
  "category": { "type": "string", "description": "Plugin category for marketplace classification." },
  "tags": { "type": "array", "items": { "type": "string" }, "description": "Tags for filtering and discovery." },
  ...
  "author": { "type": "object", "required": ["name"], "additionalProperties": false,
    "properties": { "name": {...}, "email": { "type": "string", "format": "email" } } }
  ```

## Open questions

- Does the Cursor client read the schema-only fields (`displayName`, `minClientVersions`,
  `publisher`, `category`, `tags`)?[^cursor-plugins-repo]

[^cursor-plugins-reference]: Cursor docs: Plugins reference
[^cursor-plugins-repo]: cursor/plugins: plugin.schema.json
