---
type: Harness Fact
title: "Gemini CLI: Plugin manifest fields"
description: "Plugin manifest fields in Gemini CLI, as observed over time."
tags: [plugins]
harness: gemini-cli
subject: plugins/manifest-fields
observations:
  - value:
      file: gemini-extension.json
      fields:
        - { name: name, type: string, required: true, use: "extension id; letters, digits and dashes only; used in the CLI and for command conflicts" }
        - { name: version, type: string, required: true, use: "extension version; checked on update" }
        - { name: mcpServers, type: "Record<string, MCPServerConfig>", required: false, use: "MCP servers loaded at startup; settings.json wins on a name clash" }
        - { name: contextFileName, type: "string | string[]", required: false, use: "context files loaded from the extension directory; default GEMINI.md" }
        - { name: excludeTools, type: "string[]", required: false, use: "tool names, or tool(command) patterns, hidden from the model" }
        - { name: settings, type: "ExtensionSetting[]", required: false, use: "values asked for at install and stored in the extension's .env" }
        - { name: settings.name, type: string, required: true, use: "setting display name" }
        - { name: settings.description, type: string, required: true, use: "setting explanation" }
        - { name: settings.envVar, type: string, required: true, use: "environment variable that holds the value; allowlisted for the extension" }
        - { name: settings.sensitive, type: boolean, required: false, use: "store in the system keychain and obfuscate in the UI" }
        - { name: themes, type: "CustomTheme[]", required: false, use: "custom themes registered when the extension is active" }
        - { name: plan.directory, type: string, required: false, use: "fallback directory for planning artifacts" }
        - { name: migratedTo, type: string, required: false, use: "new repository URL; the CLI checks it for updates and migrates the install" }
      not_in_manifest: "commands, hooks, skills, agents and policies are found by directory (commands, hooks/hooks.json, skills, agents, policies), not declared"
    since: null
    until: null
    observed: "2026-11-05"
    source: gemini-cli-source
    locator: "packages/cli/src/config/extension.ts:24-49; packages/cli/src/config/extensions/extensionSettings.ts:24-30; packages/cli/src/config/extension-manager.ts:1087-1122 at 3fd7d263466b9e5d30b2da1ebf85dae956a0fb86"
    evidence: source
  - value:
      docs_fields:
        - { name: description, type: string, required: false, use: "shown on geminicli.com/extensions" }
    since: null
    until: null
    observed: "2026-11-05"
    source: gemini-cli-reference-doc
    locator: "docs/extensions/reference.md:109-176 at 3fd7d263466b9e5d30b2da1ebf85dae956a0fb86"
    evidence: docs
    note: "The docs list description; the CLI's ExtensionConfig type does not declare it, so the CLI itself does not read it."
open:
  - question: "The docs say the name should be lowercase letters or numbers with dashes; the loader accepts upper-case letters too. Which one does the gallery crawler apply?"
    observed: "2026-11-05"
    source: gemini-cli-reference-doc
sources:
  - id: gemini-cli-source
    resource: "https://github.com/google-gemini/gemini-cli/tree/3fd7d263466b9e5d30b2da1ebf85dae956a0fb86/packages/cli/src/config"
    title: "google-gemini/gemini-cli config source at 3fd7d26"
  - id: gemini-cli-reference-doc
    resource: "https://github.com/google-gemini/gemini-cli/blob/3fd7d263466b9e5d30b2da1ebf85dae956a0fb86/docs/extensions/reference.md"
    title: "Gemini CLI docs: Extension reference at 3fd7d26"
---

What the sources say about [Plugin manifest fields](/subjects/plugins/manifest-fields.md) in
[Gemini CLI](/harnesses/gemini-cli.md).

## Observations

- 2026-11-05: file: `gemini-extension.json`; fields: name (string, required), version (string,
  required), mcpServers, contextFileName, excludeTools, settings (name, description, envVar,
  sensitive), themes, plan.directory, migratedTo. Commands, hooks, skills and agents come from
  directories, not manifest keys.[^gemini-cli-source]

  ```ts
  export interface ExtensionConfig {
    name: string;
    version: string;
    mcpServers?: Record<string, MCPServerConfig>;
    contextFileName?: string | string[];
    excludeTools?: string[];
    settings?: ExtensionSetting[];
    themes?: CustomTheme[];
    plan?: {
      directory?: string;
    };
    migratedTo?: string;
  }
  ...
  export interface ExtensionSetting {
    name: string;
    description: string;
    envVar: string;
    sensitive?: boolean;
  }
  ...
        if (!rawConfig.name || !rawConfig.version) {
          throw new Error(
            `Invalid configuration in ${configFilePath}: missing ${!rawConfig.name ? '"name"' : '"version"'}`,
  ```

- 2026-11-05: the docs also list `description`, shown in the extension gallery. The CLI's config
  type does not declare it, so docs and code differ on this field.[^gemini-cli-reference-doc]

  > - `description`: A short description of the extension. This will be displayed on
  >   [geminicli.com/extensions](https://geminicli.com/extensions).

  > Define
  > hooks in a `hooks/hooks.json` file within your extension directory. Note that
  > hooks are not defined in the `gemini-extension.json` manifest.

## Open questions

- The docs say the name should be lowercase letters or numbers with dashes; the loader accepts
  upper-case letters too (`/^[a-zA-Z0-9-]+$/`).[^gemini-cli-reference-doc]

  > The name should be lowercase or numbers and
  > use dashes instead of underscores or spaces.

[^gemini-cli-source]: google-gemini/gemini-cli config source at 3fd7d26
[^gemini-cli-reference-doc]: Gemini CLI docs: Extension reference at 3fd7d26
