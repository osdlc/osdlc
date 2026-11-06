---
type: Harness Fact
title: "Antigravity CLI: Plugin manifest fields"
description: "Plugin manifest fields in Antigravity CLI, as observed over time."
tags: [plugins]
harness: antigravity
subject: plugins/manifest-fields
observations:
  - value:
      file: plugin.json
      also_read: .antigravity-plugin/plugin.json
      fields:
        - { name: $schema, type: string, required: false, use: "schema URL for editor autocomplete and validation" }
        - { name: name, type: string, required: "conditional", use: "machine name; letters, digits, hyphens and underscores; namespaces bundled MCP servers", note: "agy plugin install requires it; a plugin loaded from a folder without a name is named after the folder." }
        - { name: displayName, type: string, required: false, use: "name shown in the plugin list instead of name" }
        - { name: display_name, type: string, required: false, use: "alias of displayName; displayName wins" }
        - { name: description, type: string, required: false, use: "short description in the plugin list" }
        - { name: version, type: string, required: false, use: "version shown with the plugin; any string" }
        - { name: disabled, type: boolean, required: false, use: "plugin starts disabled; default false; the user's choice wins" }
        - { name: logo, type: string, required: false, use: "plugin icon: a relative image path inside the plugin, or an https URL on a Google domain; other values ignored" }
        - { name: suggestedPrompts, type: "string[]", required: false, use: "up to three example prompts" }
        - { name: suggested_prompts, type: "string[]", required: false, use: "alias of suggestedPrompts, used only when that is empty" }
        - { name: skills, type: "string | string[]", required: false, use: "extra skill folders loaded in addition to skills" }
        - { name: author, type: "string | object", required: false, use: "plugin author" }
        - { name: author.name, type: string, required: false, use: "not documented" }
        - { name: author.email, type: string, required: false, use: "not documented" }
        - { name: author.url, type: string, required: false, use: "not documented" }
        - { name: homepage, type: string, required: false, use: "homepage or documentation URL" }
        - { name: repository, type: string, required: false, use: "source repository URL" }
        - { name: license, type: string, required: false, use: "license, such as Apache-2.0" }
        - { name: keywords, type: "string[]", required: false, use: "search keywords" }
        - { name: extensions, type: object, required: false, use: "client-specific settings keyed by namespace; each value an object" }
        - { name: source, type: string, required: false, use: "deprecated; set by older plugin imports" }
        - { name: sourcePath, type: string, required: false, use: "deprecated; set by older plugin imports" }
        - { name: source_path, type: string, required: false, use: "deprecated alias of sourcePath" }
      not_in_manifest: "MCP servers (mcp_config.json), hooks (hooks.json), agents and rules are found by fixed path, not declared"
    since: null
    until: null
    observed: "2026-11-05"
    source: antigravity-plugin-schema
    evidence: docs
  - value:
      docs_required_for_marketplace: [name, displayName, description, version, logo, author]
      docs_publish_checklist: [name, displayName, description, version, logo, suggestedPrompts, author]
      docs_name_pattern: "^[a-z0-9]+(-[a-z0-9]+)*$"
      precedence: ".antigravity-plugin/plugin.json wins over a root plugin.json"
    since: null
    until: null
    observed: "2026-11-05"
    source: antigravity-build-plugins
    locator: "Manifest file (plugin.json), Field reference"
    evidence: docs
    note: "The field table marks suggestedPrompts Recommended; the Publish section's checklist lists it among the plugin.json contents. The page's own copy of the schema is older than the hosted one: it lacks display_name, suggested_prompts, source, sourcePath and source_path, and gives the stricter kebab-case name pattern."
open:
  - question: "Is suggestedPrompts required for the Marketplace? The Build plugins field table marks it Recommended, but the Publish to the Antigravity Marketplace section asks for a complete plugin.json (name, displayName, description, version, logo, suggestedPrompts, and author)."
    observed: "2026-11-05"
    source: antigravity-build-plugins
sources:
  - id: antigravity-plugin-schema
    resource: "https://antigravity.google/schemas/v1/plugin.json"
    title: "Antigravity plugin manifest JSON Schema (v1)"
  - id: antigravity-build-plugins
    resource: "https://antigravity.google/docs/build-plugins.md"
    title: "Antigravity docs: Build plugins"
---

What the sources say about [Plugin manifest fields](/subjects/plugins/manifest-fields.md) in
[Antigravity CLI](/harnesses/antigravity.md).

## Observations

- 2026-11-05: file: `plugin.json` (or `.antigravity-plugin/plugin.json`); fields from the hosted
  schema: $schema, name (required), displayName, display_name, description, version, disabled,
  logo, suggestedPrompts, suggested_prompts, skills, author (string, or name, email, url), homepage,
  repository, license, keywords, extensions, and the deprecated source, sourcePath,
  source_path.[^antigravity-plugin-schema]

  ```json
  "required": ["name"],
  "additionalProperties": false,
  "properties": {
    "name": {
      "type": "string",
      "pattern": "^[a-zA-Z0-9_-]+$",
      "description": "Machine name of the plugin: letters, digits, hyphens, and underscores. `agy plugin install` requires it. A plugin loaded from a folder without a name is named after the folder."
    },
    "display_name": { "type": "string", "description": "Alias of displayName. displayName wins when both are set." },
    "suggested_prompts": { ..., "description": "Alias of suggestedPrompts, used only when suggestedPrompts is empty." },
    "skills": { "description": "Extra skill folders, relative to the plugin root, loaded in addition to skills/. Takes one path or a list of paths.", ... },
    "author": { "description": "Plugin author.", "anyOf": [{ "type": "string" }, { "type": "object", "additionalProperties": false, "properties": { "name": ..., "email": ..., "url": ... } }] },
    "extensions": { "type": "object", "description": "Client-specific settings, keyed by namespace.", "additionalProperties": { "type": "object" } },
    "source": { "type": "string", "deprecated": true, "description": "Set by older plugin imports. Don't set it yourself." },
  ```

- 2026-11-05: the Build plugins page marks name, displayName, description, version, logo and
  author as required for the Marketplace, and gives a stricter kebab-case name pattern than the
  hosted schema. Its embedded schema copy lacks the alias and deprecated keys. The two sources
  disagree on the name pattern and the key list. Within the page, the field table marks
  `suggestedPrompts` "Recommended" while the Publish section's checklist names it among the
  contents of a complete `plugin.json`.[^antigravity-build-plugins]

  > | `suggestedPrompts` | String\[\] | Recommended | Up to **3** actionable starter prompts displayed as clickable chips on the plugin detail page. |

  > Once your plugin passes `agy plugin validate --strict` and includes a complete `plugin.json` (`name`, `displayName`, `description`, `version`, `logo`, `suggestedPrompts`, and `author`), `README.md`, and bundled logo asset, submit it through the [Antigravity Marketplace partner intake form](https://forms.gle/2EX5RFYPoJe1UgxR9).

  > | `name` | String | **Yes** (CLI and Marketplace) / Optional (local folders) | The unique, machine-readable lowercase `kebab-case` identifier of the plugin (`^[a-z0-9]+(-[a-z0-9]+)*$`). ...

  > Place `plugin.json` at `<plugin-root>/plugin.json` for standalone Antigravity plugins, or inside `<plugin-root>/.antigravity-plugin/plugin.json` for multi-provider repositories ... (`.antigravity-plugin/plugin.json` takes precedence over root `plugin.json`).

## Open questions

- Is `suggestedPrompts` required for the Marketplace? The two statements above disagree.[^antigravity-build-plugins]

[^antigravity-plugin-schema]: Antigravity plugin manifest JSON Schema (v1)
[^antigravity-build-plugins]: Antigravity docs: Build plugins
