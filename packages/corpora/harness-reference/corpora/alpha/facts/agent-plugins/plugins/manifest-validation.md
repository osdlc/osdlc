---
type: Harness Fact
title: "Agent Plugins: Plugin manifest validation"
description: "Plugin manifest validation in Agent Plugins, as observed over time."
tags: [plugins]
harness: agent-plugins
subject: plugins/manifest-validation
observations:
  - value:
      unknown_fields: warned
      invalid_fields: "any other schema violation is fatal: the client rejects the plugin and discovers none of its components"
      invalid_extensions: "a non-object extensions field is reported and ignored; loading continues"
      unsupported_schema_version: "the client rejects the plugin and should report the version"
      schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"
    since: "1.0.0"
    until: null
    observed: "2026-11-05"
    source: agent-plugins-spec
    locator: "spec/1.0.0.md:141-151, 189-212, 427, 543-550 at ff8ab5e392cc87bd88d87c060815a87490e51003"
    evidence: docs
    note: "unknown_fields: clients MUST report and ignore each unknown top-level field and keep loading. Clients must not fetch the schema while loading; $schema only selects local rules. Format checks on version, URLs, email and license are forbidden as grounds for rejection."
open:
  - question: "Does the project ship a validator command or library, beyond the JSON Schemas? The spec and site name none."
    observed: "2026-11-05"
    source: agent-plugins-spec
sources:
  - id: agent-plugins-spec
    resource: "https://github.com/agentplugins/agent-plugins-spec/blob/ff8ab5e392cc87bd88d87c060815a87490e51003/spec/1.0.0.md"
    title: "Agent Plugins Specification 1.0.0"
---

What the sources say about [Plugin manifest validation](/subjects/plugins/manifest-validation.md)
in [Agent Plugins](/harnesses/agent-plugins.md).

The schema closes the manifest (`additionalProperties: false`), so an unknown field fails the
schema. The spec still tells clients to report and ignore it. The spec says its text wins.

## Observations

- 2026-11-05: unknown top-level fields: reported and ignored; any other violation rejects the
  plugin; schema: `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`.[^agent-plugins-spec]

  > If `plugin.json` contains any other top-level field, it does not conform to the schema. Clients MUST report and ignore each unknown field and MUST continue loading the plugin if the manifest otherwise satisfies this section. Clients MUST NOT assign semantics to unknown fields.

  > Any schema violation other than an unknown top-level field or a non-object `extensions` field is fatal: the client MUST reject the plugin and MUST NOT discover or execute any of its components.

  > The official machine-readable schema is [`schemas/1.0.0/plugin.schema.json`](../schemas/1.0.0/plugin.schema.json). The specification text is authoritative if it conflicts with the schema.

  > Clients MUST NOT retrieve a schema while loading a plugin. If a client does not support the declared Agent Plugins version or an explicitly recognized compatible version, it MUST reject the plugin and SHOULD report the unsupported version.

  > Clients MUST NOT reject a manifest solely because `version` is not valid Semantic Versioning; `homepage`, `repository`, or `author.url` is not a recognized URL; `author.email` is not a recognized email address; or `license` is not an SPDX identifier.

## Open questions

- Whether a validator ships besides the JSON Schemas.[^agent-plugins-spec]

[^agent-plugins-spec]: Agent Plugins Specification 1.0.0
