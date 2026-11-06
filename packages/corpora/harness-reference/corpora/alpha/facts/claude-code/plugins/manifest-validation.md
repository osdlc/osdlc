---
type: Harness Fact
title: "Claude Code: Plugin manifest validation"
description: "Plugin manifest validation in Claude Code, as observed over time."
tags: [plugins]
harness: claude-code
subject: plugins/manifest-validation
observations:
  - value:
      unknown_fields: ignored
      strict_objects: "an unknown key inside a userConfig option, channels entry, lspServers config or monitors entry is an error; the plugin does not load"
      invalid_fields: "a type mismatch or a missing or escaping path fails validation; Claude Code reports the same problem when it loads the plugin"
      validator: "claude plugin validate <dir> (--strict turns warnings into failures)"
      validator_warns_on: "unknown top-level field, non-kebab-case name, missing version, description or author"
    since: null
    until: null
    observed: "2026-11-05"
    source: claude-plugins-reference
    locator: "Unrecognized fields; Validate the manifest"
    evidence: docs
    note: "An unknown top-level key in plugin.json is stripped and the plugin loads; the validator reports it as a warning."
  - value:
      marketplace_unknown_fields: ignored
      marketplace_invalid_entry: "each entry is validated on its own, so one invalid entry does not fail the marketplace"
      marketplace_validator: "claude plugin validate <marketplace root or marketplace.json>"
    since: null
    until: null
    observed: "2026-11-05"
    source: claude-marketplace-reference
    locator: "Marketplace file; Top-level fields; Validation messages"
    evidence: docs
    note: "The validator warns `Unknown field 'x'. Claude Code ignores it at load time.` for unknown keys at the top level, under metadata, in an entry, or under an entry's relevance."
open:
  - question: "The docs describe a $schema key for editor autocomplete but name no schema URL. Does Anthropic publish a JSON Schema for plugin.json or marketplace.json?"
    observed: "2026-11-05"
    source: claude-plugins-reference
sources:
  - id: claude-plugins-reference
    resource: "https://code.claude.com/docs/en/plugins-reference.md"
    title: "Claude Code docs: Plugin manifest reference"
  - id: claude-marketplace-reference
    resource: "https://code.claude.com/docs/en/plugins/marketplace-reference.md"
    title: "Claude Code docs: Marketplace reference"
---

What the sources say about [Plugin manifest validation](/subjects/plugins/manifest-validation.md)
in [Claude Code](/harnesses/claude-code.md).

## Observations

- 2026-11-05: plugin.json: unknown top-level fields ignored (stripped, plugin loads); unknown keys
  in strict objects rejected; type mismatches and bad paths fail; validator:
  `claude plugin validate`, with `--strict`.[^claude-plugins-reference]

  > An unrecognized top-level key is stripped, and an unrecognized key inside a `userConfig` option, `channels` entry, `lspServers` config, or `monitors` entry is rejected:
  >
  > * **Top-level fields**: the field is stripped and the plugin loads. `claude plugin validate` reports each unrecognized top-level field as a warning
  > * **Strict objects**: `userConfig` options, `channels` entries, `lspServers` configs, and `monitors` entries are strict. An unknown key inside one is an error, and the plugin doesn't load

  > * **`Validation passed with warnings`**: the manifest loads, but the validator found something to fix, such as an unknown top-level field that Claude Code strips, a `name` that isn't kebab-case, or a missing `version`, `description`, or `author`. Pass `--strict` to turn warnings into failures in CI
  > * **`Validation failed`**: the manifest has a type mismatch, a path that is missing or escapes the plugin root, or an unknown key inside a `userConfig` option, `channels` entry, `lspServers` config, or `monitors` entry. Claude Code reports the same problem when it loads the plugin

- 2026-11-05: marketplace.json: unknown keys ignored, validator warns; one bad entry does not
  fail the marketplace.[^claude-marketplace-reference]

  > Claude Code ignores an unknown top-level key or plugin-entry key rather than rejecting it, so a typo loads silently. `claude plugin validate` reports each unknown key as a warning.

  > | `plugins` | array | [Plugin entries](#plugin-entries). Each entry is validated on its own, so one invalid entry doesn't fail the marketplace |

## Open questions

- No schema URL is named in the docs, though both files take a `$schema` key.[^claude-plugins-reference]

[^claude-plugins-reference]: Claude Code docs: Plugin manifest reference
[^claude-marketplace-reference]: Claude Code docs: Marketplace reference
