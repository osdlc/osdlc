---
type: Harness Fact
title: "Cursor: Marketplace fields"
description: "Marketplace fields in Cursor, as observed over time."
tags: [plugins]
harness: cursor
subject: plugins/marketplace-fields
observations:
  - value:
      file: .cursor-plugin/marketplace.json
      fields:
        - { name: name, type: string, required: true, use: "marketplace id (kebab-case)" }
        - { name: owner, type: object, required: true, use: "marketplace owner" }
        - { name: owner.name, required: true, use: "not documented" }
        - { name: owner.email, required: false, use: "not documented" }
        - { name: plugins, type: array, required: true, use: "plugin entries; the whole file must be 10 MB or smaller" }
        - { name: metadata, type: object, required: false, use: "marketplace metadata" }
        - { name: metadata.description, required: false, use: "not documented" }
        - { name: metadata.version, required: false, use: "not documented" }
        - { name: metadata.pluginRoot, required: false, use: "prefix path for all plugin sources" }
      entry_fields:
        - { name: name, type: string, required: true, use: "plugin id (kebab-case)" }
        - { name: source, type: "string | object", required: false, use: "plugin directory, or an object with path and options", note: "The docs mark only name required in an entry." }
        - { name: description, type: string, required: false, use: "plugin description" }
        - { name: version, type: string, required: false, use: "semantic version" }
        - { name: author, type: object, required: false, use: "author info" }
        - { name: homepage, type: string, required: false, use: "URL" }
        - { name: repository, type: string, required: false, use: "URL" }
        - { name: license, type: string, required: false, use: "license identifier" }
        - { name: keywords, type: array, required: false, use: "search tags" }
        - { name: logo, type: string, required: false, use: "relative path or URL to the logo" }
        - { name: category, type: string, required: false, use: "plugin category" }
        - { name: tags, type: array, required: false, use: "additional tags" }
        - { name: skills, type: "string | array", required: false, use: "component paths" }
        - { name: rules, type: "string | array", required: false, use: "component paths" }
        - { name: agents, type: "string | array", required: false, use: "component paths" }
        - { name: commands, type: "string | array", required: false, use: "component paths" }
        - { name: hooks, type: "string | object", required: false, use: "hooks config path or inline config" }
        - { name: mcpServers, type: "string | object", required: false, use: "MCP config path or inline config" }
        - { name: variables, type: object, required: false, use: "JSON Schema of variable names; the plugin.json value wins when both are set" }
    since: null
    until: null
    observed: "2026-11-05"
    source: cursor-plugins-reference
    locator: "Cursor multi-plugin repositories: Marketplace manifest fields; Plugin entry fields; How resolution works"
    evidence: docs
    note: "The entry is merged with the plugin's own .cursor-plugin/plugin.json, and the plugin.json values take precedence."
  - value:
      schema_file: .cursor-plugin/marketplace.json
      schema_fields:
        - { name: name, type: string, required: true, use: "marketplace id" }
        - { name: owner, type: object, required: false, use: "marketplace owner or organisation" }
        - { name: owner.name, type: string, required: "conditional", use: "owner name", note: "Required when owner is set." }
        - { name: owner.email, type: string, required: false, use: "contact email; format email" }
        - { name: metadata, type: object, required: false, use: "arbitrary metadata; extra keys allowed" }
        - { name: metadata.description, type: string, required: false, use: "short marketplace description" }
        - { name: plugins, type: array, required: true, use: "plugins in the marketplace" }
      schema_entry_fields:
        - { name: name, type: string, required: true, use: "plugin id matching the name in its plugin.json" }
        - { name: source, type: string, required: true, use: "plugin directory relative to the marketplace root, or a remote URL" }
        - { name: description, type: string, required: false, use: "short plugin description" }
        - { name: minClientVersions, type: object, required: false, use: "minimum client versions to install, keyed by client id" }
    since: null
    until: null
    observed: "2026-11-05"
    source: cursor-plugins-repo
    locator: "schemas/marketplace.schema.json:1-115 at 2776ddd2355d6d6c8747d3964600f28daf62f049"
    evidence: source
    note: "The schema the official cursor/plugins marketplace repository checks in CI. Entries are closed (additionalProperties false), so the docs' other entry fields fail it."
open:
  - question: "Docs and the cursor/plugins schema disagree: the docs require owner, the schema does not; the docs list sixteen more entry fields, which the schema rejects; the schema requires source as a string, the docs allow an object. Which does the Cursor client follow?"
    observed: "2026-11-05"
    source: cursor-plugins-repo
  - question: "The docs say source may be an object with path and options but name no options. What source object forms does Cursor accept?"
    observed: "2026-11-05"
    source: cursor-plugins-reference
sources:
  - id: cursor-plugins-reference
    resource: "https://cursor.com/docs/reference/plugins.md"
    title: "Cursor docs: Plugins reference"
  - id: cursor-plugins-repo
    resource: "https://github.com/cursor/plugins/blob/2776ddd2355d6d6c8747d3964600f28daf62f049/schemas/marketplace.schema.json"
    title: "cursor/plugins: marketplace.schema.json"
---

What the sources say about [Marketplace fields](/subjects/plugins/marketplace-fields.md) in
[Cursor](/harnesses/cursor.md).

The docs and the schema in Cursor's official plugins repository disagree on `owner`, on the entry
fields and on the shape of `source`. Both are recorded.

## Observations

- 2026-11-05: file: `.cursor-plugin/marketplace.json`; top-level fields: `name`, `owner`
  (`name`, `email`), `plugins` (all required), `metadata` (`description`, `version`,
  `pluginRoot`); entry fields: `name` (required), `source`, `description`, `version`, `author`,
  `homepage`, `repository`, `license`, `keywords`, `logo`, `category`, `tags`, `skills`, `rules`,
  `agents`, `commands`, `hooks`, `mcpServers`, `variables`.[^cursor-plugins-reference]

  > A single Git repository can contain multiple plugins using a **marketplace manifest**. Place it at `.cursor-plugin/marketplace.json` in the repository root.

  > | `name`     | string | **(required)** Marketplace identifier (kebab-case)                                        |
  > | `owner`    | object | **(required)** `name` (required), `email` (optional)                                      |
  > | `plugins`  | array  | **(required)** Array of plugin entries. The whole manifest file must be 10 MB or smaller. |
  > | `metadata` | object | Optional. `description`, `version`, `pluginRoot` (prefix path for all plugin sources)     |

  > | `name`                                  | string           | **(required)** Plugin identifier (kebab-case) |
  > | `source`                                | string or object | Path to plugin directory, or object with `path` and options |
  > | `skills`, `rules`, `agents`, `commands` | string or array  | Path(s) to component files |

  > 2. If found, the per-plugin manifest is merged with the marketplace entry (manifest values take precedence)

- 2026-11-05: schema: top level `name`, `plugins` (required), `owner`, `metadata`; entries closed
  to `name`, `source` (both required, `source` a string), `description`,
  `minClientVersions`.[^cursor-plugins-repo]

  ```json
  "required": ["name", "plugins"],
  "additionalProperties": false,
  ...
  "pluginEntry": {
    "type": "object",
    "required": ["name", "source"],
    "additionalProperties": false,
    "properties": {
      "name": { "type": "string", "minLength": 1, "pattern": "^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$" },
      "source": { "type": "string", "minLength": 1,
        "description": "Path to the plugin directory (relative to the marketplace root) or a remote URL." },
      "description": { "type": "string" },
      "minClientVersions": { "$ref": "#/$defs/minClientVersions" }
    }
  }
  ```

## Open questions

- Which of the two field sets the Cursor client follows.[^cursor-plugins-repo]
- What source object forms Cursor accepts.[^cursor-plugins-reference]

[^cursor-plugins-reference]: Cursor docs: Plugins reference
[^cursor-plugins-repo]: cursor/plugins: marketplace.schema.json
