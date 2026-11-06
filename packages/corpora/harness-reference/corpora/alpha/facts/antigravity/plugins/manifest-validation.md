---
type: Harness Fact
title: "Antigravity CLI: Plugin manifest validation"
description: "Plugin manifest validation in Antigravity CLI, as observed over time."
tags: [plugins]
harness: antigravity
subject: plugins/manifest-validation
observations:
  - value:
      unknown_fields: "ignored at load; reported by agy plugin validate"
      invalid_fields: "plugin not loaded"
      validator: "agy plugin validate [--strict] <path>"
      validator_strict: "treats warnings as errors"
      schema: "https://antigravity.google/schemas/v1/plugin.json"
    since: null
    until: null
    observed: "2026-11-05"
    source: antigravity-plugin-schema
    evidence: docs
    note: "The hosted schema sets additionalProperties false, which a schema validator would reject, while its own description says the harness ignores unknown keys."
  - value: { validator_scope: "plugin.json, MCP servers and component discovery" }
    since: null
    until: null
    observed: "2026-11-05"
    source: antigravity-build-plugins
    locator: "Quickstart; Validate and test locally"
    evidence: docs
sources:
  - id: antigravity-plugin-schema
    resource: "https://antigravity.google/schemas/v1/plugin.json"
    title: "Antigravity plugin manifest JSON Schema (v1)"
  - id: antigravity-build-plugins
    resource: "https://antigravity.google/docs/build-plugins.md"
    title: "Antigravity docs: Build plugins"
---

What the sources say about [Plugin manifest validation](/subjects/plugins/manifest-validation.md)
in [Antigravity CLI](/harnesses/antigravity.md).

## Observations

- 2026-11-05: unknown fields: ignored at load and reported by `agy plugin validate`; a known key
  with the wrong type stops the plugin loading. Schema: the hosted v1 plugin
  schema.[^antigravity-plugin-schema]

  > "description": "Manifest for an Antigravity plugin (plugin.json at the plugin root, or in .antigravity-plugin/). Keys are case-sensitive. Antigravity ignores keys it doesn't recognize, and `agy plugin validate` reports them. A recognized key with the wrong type stops the plugin from loading. Documentation: https://antigravity.google/docs/plugins",

- 2026-11-05: validator: `agy plugin validate --strict` checks plugin.json, MCP servers and
  component discovery, and treats warnings as errors.[^antigravity-build-plugins]

  > # Validate plugin.json, MCP servers, and component discovery
  > agy plugin validate --strict ./my-first-plugin

  > # Run strict schema and component validation (treats warnings as errors)
  > agy plugin validate --strict ./my-plugin

[^antigravity-plugin-schema]: Antigravity plugin manifest JSON Schema (v1)
[^antigravity-build-plugins]: Antigravity docs: Build plugins
