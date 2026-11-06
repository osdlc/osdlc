---
type: Harness Fact
title: "Agent Plugins: Plugin manifest fields"
description: "Plugin manifest fields in Agent Plugins, as observed over time."
tags: [plugins]
harness: agent-plugins
subject: plugins/manifest-fields
observations:
  - value:
      file: plugin.json
      fields:
        - { name: $schema, type: string, required: true, use: "canonical schema id; selects the client's local validation rules; an unsupported version rejects the plugin" }
        - { name: name, type: string, required: true, use: "human-readable plugin name; 1-64 of a-z, 0-9, hyphen and period, alphanumeric at both ends, no -- or .." }
        - { name: version, type: string, required: false, use: "update checks and cache freshness; semver recommended, not enforced" }
        - { name: description, type: string, required: false, use: "short description of plugin purpose" }
        - { name: author, type: object, required: false, use: "may hold only name, email and url strings" }
        - { name: author.name, type: string, required: false, use: "not documented" }
        - { name: author.email, type: string, required: false, use: "not documented" }
        - { name: author.url, type: string, required: false, use: "not documented" }
        - { name: homepage, type: string, required: false, use: "documentation or homepage URL" }
        - { name: repository, type: string, required: false, use: "source repository URL" }
        - { name: license, type: string, required: false, use: "license identifier; SPDX recommended" }
        - { name: keywords, type: "string[]", required: false, use: "search and discovery tags" }
        - { name: extensions, type: object, required: false, use: "client-specific data keyed by reverse-domain namespace; each value an object" }
    since: "1.0.0"
    until: null
    observed: "2026-11-05"
    source: agent-plugins-spec
    locator: "spec/1.0.0.md:129-235 at ff8ab5e392cc87bd88d87c060815a87490e51003"
    evidence: docs
    note: "The manifest is closed: these are the only permitted top-level fields. Component locations are fixed (skills, mcp.json), not manifest fields. The 1.1.0 working draft and its schema have the same field set."
  - value:
      schema_required: [$schema, name]
      schema_closed: true
      schema_fields: [$schema, name, version, description, author, author.name, author.email, author.url, homepage, repository, license, keywords, extensions]
    since: "1.0.0"
    until: null
    observed: "2026-11-05"
    source: agent-plugins-schema
    locator: "schemas/1.0.0/plugin.schema.json:1-65 at ff8ab5e392cc87bd88d87c060815a87490e51003"
    evidence: docs
    note: "The schema matches the spec text. The spec says its text wins if the two conflict."
sources:
  - id: agent-plugins-spec
    resource: "https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/spec/1.0.0.md"
    title: "Agent Plugins Specification 1.0.0"
  - id: agent-plugins-schema
    resource: "https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/schemas/1.0.0/plugin.schema.json"
    title: "Agent Plugins 1.0.0 plugin manifest schema"
---

What the sources say about [Plugin manifest fields](/subjects/plugins/manifest-fields.md) in
[Agent Plugins](/harnesses/agent-plugins.md).

## Observations

- 2026-11-05: file: `plugin.json` at the plugin root; fields: `$schema` and `name` (required),
  `version`, `description`, `author` (`name`, `email`, `url`), `homepage`, `repository`,
  `license`, `keywords`, `extensions`. Closed manifest.[^agent-plugins-spec]

  > Clients MUST check for a manifest at `plugin.json` in the plugin root.

  > The manifest MUST be JSON and MUST contain a top-level object. Its schema is closed: the only permitted top-level fields are `$schema`, `name`, `version`, `description`, `author`, `homepage`, `repository`, `license`, `keywords`, and `extensions`.

  > | `$schema` | string | Canonical plugin manifest schema identifier defined in §5.2. |
  > | `name`    | string | Human-readable plugin name.                                  |

  > | `version`     | string    | Version string (Semantic Versioning RECOMMENDED). Used for update checks and cache freshness. |
  > | `author`      | object    | Author object with optional `name`, `email`, and `url` string fields.                         |
  > | `keywords`    | string\[] | Search and discovery tags.                                                                    |

  > The optional `extensions` field in `plugin.json` MUST be an object whose member names are client extension namespaces and whose member values are objects.

- 2026-11-05: the 1.0.0 JSON Schema requires `$schema` and `name` and sets
  `additionalProperties: false` at the top level and in `author`.[^agent-plugins-schema]

  ```json
  "author": {
    "type": "object",
    "properties": { "name": { "type": "string" }, "email": { "type": "string" }, "url": { "type": "string" } },
    "additionalProperties": false
  },
  ...
  "extensions": { "type": "object", "additionalProperties": { "type": "object" } }
  },
  "required": ["$schema", "name"],
  "additionalProperties": false
  ```

[^agent-plugins-spec]: Agent Plugins Specification 1.0.0
[^agent-plugins-schema]: Agent Plugins 1.0.0 plugin manifest schema
