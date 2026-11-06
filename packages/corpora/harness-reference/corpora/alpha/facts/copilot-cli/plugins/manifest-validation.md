---
type: Harness Fact
title: "Copilot CLI: Plugin manifest validation"
description: "Plugin manifest validation in Copilot CLI, as observed over time."
tags: [plugins]
harness: copilot-cli
subject: plugins/manifest-validation
observations:
  - value:
      unknown_fields: warned
      invalid_fields: "an Agent Plugins version the CLI does not support rejects the plugin; it contributes no components"
      schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"
      entry_strict: "a marketplace entry's strict (default true) applies the full schema and validation rules; false relaxes them"
    since: null
    until: null
    observed: "2026-11-05"
    source: copilot-cli-plugin-reference
    locator: "content/copilot/reference/copilot-cli-reference/cli-plugin-reference.md:123, 144, 355 at 17d6ee52f965e7c46f74b4339d5fa1ad6f4f4493"
    evidence: docs
    note: "unknown_fields covers Agent Plugins manifests: unknown top-level fields are reported and ignored. The 1.1.0 schema is also recognized."
open:
  - question: "What does Copilot CLI do with an unknown or wrongly typed field in a legacy plugin.json or in marketplace.json? The docs answer only for Agent Plugins manifests."
    observed: "2026-11-05"
    source: copilot-cli-plugin-reference
  - question: "Does Copilot CLI have a command that validates a manifest? The plugin command table lists none."
    observed: "2026-11-05"
    source: copilot-cli-plugin-reference
sources:
  - id: copilot-cli-plugin-reference
    resource: "https://github.com/github/docs/blob/17d6ee52f965e7c46f74b4339d5fa1ad6f4f4493/content/copilot/reference/copilot-cli-reference/cli-plugin-reference.md"
    title: "GitHub Docs: GitHub Copilot CLI plugin reference"
---

What the sources say about [Plugin manifest validation](/subjects/plugins/manifest-validation.md)
in [Copilot CLI](/harnesses/copilot-cli.md).

## Observations

- 2026-11-05: Agent Plugins manifests: unknown top-level fields are reported and ignored; an
  unsupported Agent Plugins version rejects the plugin; a marketplace entry's `strict` sets how
  strictly the plugin is validated.[^copilot-cli-plugin-reference]

  > If a plugin declares an Agent Plugins version that {% data variables.copilot.copilot_cli_short %} doesn't support, the CLI rejects the plugin instead of silently falling back to legacy mode. A rejected plugin contributes no hooks, LSP servers, MCP servers, skills, commands, agents, rules, or extension directories.

  > Unknown top-level fields are reported and ignored.

  > | `strict`      | boolean            | No       | When `true` (the default), plugins must conform to the full schema and validation rules. When `false`, relaxed validation is used, allowing more flexibility—especially for direct installs or legacy plugins. |

## Open questions

- Unknown and wrongly typed fields in legacy manifests and in `marketplace.json`.[^copilot-cli-plugin-reference]
- Whether a validate command exists.[^copilot-cli-plugin-reference]

[^copilot-cli-plugin-reference]: GitHub Docs: GitHub Copilot CLI plugin reference
