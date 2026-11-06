---
type: Harness Fact
title: "Cursor: Plugin manifest validation"
description: "Plugin manifest validation in Cursor, as observed over time."
tags: [plugins]
harness: cursor
subject: plugins/manifest-validation
observations:
  - value:
      validator: "node scripts/validate-template.mjs in the cursor/plugin-template repository"
      checks: "marketplace name and owner.name, non-empty plugins, safe relative sources and pluginRoot, plugin names, entry name equal to plugin.json name, referenced paths exist, component frontmatter"
      unknown_fields: "not checked"
    since: null
    until: null
    observed: "2026-11-05"
    source: cursor-plugin-template
    locator: "scripts/validate-template.mjs:250-344 at 46216072ac5750f782f95bb325b4d12b7c3ae9c9"
    evidence: source
  - value:
      schema_validator: "node scripts/validate-plugins.mjs (Ajv) in the cursor/plugins repository CI"
      schema_unknown_fields: rejected
      schema: "https://github.com/cursor/plugins/blob/2776ddd2355d6d6c8747d3964600f28daf62f049/schemas/plugin.schema.json"
      marketplace_schema: "https://github.com/cursor/plugins/blob/2776ddd2355d6d6c8747d3964600f28daf62f049/schemas/marketplace.schema.json"
    since: null
    until: null
    observed: "2026-11-05"
    source: cursor-plugins-repo
    locator: "scripts/validate-plugins.mjs:16-25, 76-81; schemas/plugin.schema.json:8; schemas/marketplace.schema.json:8, 57 at 2776ddd2355d6d6c8747d3964600f28daf62f049"
    evidence: source
    note: "Both schemas set additionalProperties false, so an unknown field fails this CI check. It checks the official marketplace repository, not the client."
open:
  - question: "What does the Cursor client do with an unknown or wrongly typed field in .cursor-plugin/plugin.json or marketplace.json? The docs do not say."
    observed: "2026-11-05"
    source: cursor-plugins-reference
  - question: "Does Cursor ship a validate command of its own? The docs' submission checklist asks for a valid manifest but names no tool."
    observed: "2026-11-05"
    source: cursor-plugins-reference
sources:
  - id: cursor-plugins-reference
    resource: "https://cursor.com/docs/reference/plugins.md"
    title: "Cursor docs: Plugins reference"
  - id: cursor-plugin-template
    resource: "https://github.com/cursor/plugin-template/blob/46216072ac5750f782f95bb325b4d12b7c3ae9c9/scripts/validate-template.mjs"
    title: "cursor/plugin-template: validate-template.mjs"
  - id: cursor-plugins-repo
    resource: "https://github.com/cursor/plugins/blob/2776ddd2355d6d6c8747d3964600f28daf62f049/scripts/validate-plugins.mjs"
    title: "cursor/plugins: validate-plugins.mjs"
---

What the sources say about [Plugin manifest validation](/subjects/plugins/manifest-validation.md)
in [Cursor](/harnesses/cursor.md).

## Observations

- 2026-11-05: the plugin template ships a Node validator that checks names, sources and paths,
  but not unknown fields.[^cursor-plugin-template]

  ```js
  if (!marketplace.owner || typeof marketplace.owner.name !== "string" || marketplace.owner.name.length === 0) {
    addError('Marketplace "owner.name" is required.');
  }
  ...
  if (pluginManifest.name && pluginManifest.name !== entry.name) {
    addError(
      `${entry.name}: marketplace entry name does not match plugin.json name ("${pluginManifest.name}").`
    );
  }

  const manifestFields = ["logo", "rules", "skills", "agents", "commands", "hooks", "mcpServers"];
  ```

- 2026-11-05: the official plugins repository checks every manifest against closed JSON Schemas
  with Ajv, so unknown fields fail there.[^cursor-plugins-repo]

  ```js
  const marketplaceSchema = loadJSON(
    resolve(root, "schemas/marketplace.schema.json")
  );
  const pluginSchema = loadJSON(resolve(root, "schemas/plugin.schema.json"));

  const ajv = new Ajv({ allErrors: true });
  ```

  ```json
  "required": ["name"],
  "additionalProperties": false,
  ```

## Open questions

- What the client does with an unknown or wrongly typed field.[^cursor-plugins-reference]
- Whether Cursor ships its own validate command.[^cursor-plugins-reference]

[^cursor-plugins-reference]: Cursor docs: Plugins reference
[^cursor-plugin-template]: cursor/plugin-template: validate-template.mjs
[^cursor-plugins-repo]: cursor/plugins: validate-plugins.mjs
