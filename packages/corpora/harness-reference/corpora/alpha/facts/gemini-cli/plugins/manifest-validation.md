---
type: Harness Fact
title: "Gemini CLI: Plugin manifest validation"
description: "Plugin manifest validation in Gemini CLI, as observed over time."
tags: [plugins]
harness: gemini-cli
subject: plugins/manifest-validation
observations:
  - value:
      unknown_fields: ignored
      invalid_fields: "a missing name or version, a name with characters other than letters, digits and dashes, or malformed JSON fails the load and the extension is not installed; other field types are not checked at load"
      validator: "gemini extensions validate <path>"
      validator_checks: "context files exist and stay inside the extension; version is semver (warning); mcpServers is an object and each server names a transport (command, url, httpUrl or tcp) and has a valid URL; httpUrl is deprecated (warning)"
    since: null
    until: null
    observed: "2026-11-05"
    source: gemini-cli-source
    locator: "packages/cli/src/config/extension-manager.ts:1087-1122, 1510-1516; packages/cli/src/commands/extensions/validate.ts:36-193 at 3fd7d263466b9e5d30b2da1ebf85dae956a0fb86"
    evidence: source
open:
  - question: "Does Gemini CLI publish a JSON Schema for gemini-extension.json? None was found in the docs or the repository's config source."
    observed: "2026-11-05"
    source: gemini-cli-source
sources:
  - id: gemini-cli-source
    resource: "https://github.com/google-gemini/gemini-cli/tree/3fd7d263466b9e5d30b2da1ebf85dae956a0fb86/packages/cli/src"
    title: "google-gemini/gemini-cli CLI source at 3fd7d26"
---

What the sources say about [Plugin manifest validation](/subjects/plugins/manifest-validation.md)
in [Gemini CLI](/harnesses/gemini-cli.md).

## Observations

- 2026-11-05: unknown fields: ignored (the file is cast, not schema-checked). A missing name or
  version, or a bad name, fails the load. Validator: `gemini extensions validate <path>`, which
  checks context files, semver, and MCP server transports.[^gemini-cli-source]

  ```ts
        const rawConfig = JSON.parse(configContent) as ExtensionConfig;
        if (!rawConfig.name || !rawConfig.version) {
          throw new Error(
  ...
  function validateName(name: string) {
    if (!/^[a-zA-Z0-9-]+$/.test(name)) {
  ...
  export const validateCommand: CommandModule = {
    command: 'validate <path>',
    describe: 'Validates an extension from a local path.',
  ...
    if (!semver.valid(extensionConfig.version)) {
      warnings.push(
  ...
          if (!hasCommand && !hasUrl && !hasHttpUrl && !hasTcp) {
            errors.push(
              `MCP server "${serverName}" must specify a transport (e.g., "command", "url", or "httpUrl").`,
  ```

## Open questions

- Does Gemini CLI publish a JSON Schema for `gemini-extension.json`? None was found.[^gemini-cli-source]

[^gemini-cli-source]: google-gemini/gemini-cli CLI source at 3fd7d26
