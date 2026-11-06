---
type: Harness Fact
title: "Qwen Code: Plugin manifest fields"
description: "Plugin manifest fields in Qwen Code, as observed over time."
tags: [plugins]
harness: qwen-code
subject: plugins/manifest-fields
observations:
  - value:
      file: qwen-extension.json
      fields:
        - { name: name, type: string, required: true, use: "extension id; letters, digits, underscores, dots and dashes" }
        - { name: version, type: string, required: false, use: "extension version", note: "Typed as a required string, but the loader checks only name." }
        - { name: displayName, type: "string | Record<string, string>", required: false, use: "display name; a map is resolved by locale" }
        - { name: description, type: "string | Record<string, string>", required: false, use: "description; a map is resolved by locale" }
        - { name: mcpServers, type: "Record<string, MCPServerConfig>", required: false, use: "MCP servers loaded at startup; settings.json wins on a name clash" }
        - { name: lspServers, type: "string | object", required: false, use: "not documented" }
        - { name: contextFileName, type: "string | string[]", required: false, use: "context files; default QWEN.md" }
        - { name: commands, type: "string | string[]", required: false, use: "command directory; default commands" }
        - { name: skills, type: "string | string[]", required: false, use: "skill directory; default skills" }
        - { name: skillStates, type: "Record<string, boolean>", required: false, use: "not documented" }
        - { name: agents, type: "string | string[]", required: false, use: "subagent directory; default agents" }
        - { name: workflows, type: "string | string[]", required: false, use: "workflow directories or .js files; default workflows" }
        - { name: settings, type: "ExtensionSetting[]", required: false, use: "values asked for at install, passed to MCP servers as environment variables" }
        - { name: settings.name, type: string, required: true, use: "setting display name" }
        - { name: settings.description, type: string, required: true, use: "what the setting is for" }
        - { name: settings.envVar, type: string, required: true, use: "environment variable that is set" }
        - { name: settings.sensitive, type: boolean, required: false, use: "hide the value" }
        - { name: hooks, type: "object keyed by hook event", required: false, use: "inline hook definitions" }
        - { name: channels, type: "Record<string, ExtensionChannelConfig>", required: false, use: "custom channel adapters keyed by channel type" }
        - { name: channels.entry, type: string, required: true, use: "JS entry that exports a ChannelPlugin" }
        - { name: channels.displayName, type: string, required: false, use: "name in CLI output" }
        - { name: channels.requiredConfigFields, type: "string[]", required: false, use: "extra config fields the channel needs" }
      also_loaded: "a root plugin.json that declares the Agent Plugins schema is loaded natively; .claude-plugin/plugin.json, gemini-extension.json and .qoder-plugin/plugin.json are converted to qwen-extension.json on install"
    since: null
    until: null
    observed: "2026-11-05"
    source: qwen-code-source
    locator: "packages/core/src/extension/extensionManager.ts:161-168, 201-222, 2128-2178, 3702-3708; extensionSettings.ts:146-152 at 1bac51b7d9e28d5c0f7d9a0a6fcd3add14443ebb"
    evidence: source
  - value: { docs_fields: [name, version, mcpServers, channels, contextFileName, commands, skills, agents, workflows, settings], docs_omit: [displayName, description, lspServers, skillStates, hooks] }
    since: null
    until: null
    observed: "2026-11-05"
    source: qwen-code-extensions-doc
    locator: "docs/users/extension/introduction.md:265-316 at 1bac51b7d9e28d5c0f7d9a0a6fcd3add14443ebb"
    evidence: docs
  - value:
      agent_plugin_file: plugin.json
      agent_plugin_fields:
        - { name: $schema, type: string, required: true, use: "must equal the Agent Plugins 1.0.0 schema URI" }
        - { name: name, type: string, required: true, use: "id and display name; 1-64 lowercase letters, digits, dots or hyphens" }
        - { name: version, type: string, required: false, use: "version; default 1.0.0" }
        - { name: description, type: string, required: false, use: "description" }
        - { name: author, type: object, required: false, use: "checked for type; keys name, email, url" }
        - { name: homepage, type: string, required: false, use: "checked for type" }
        - { name: repository, type: string, required: false, use: "checked for type" }
        - { name: license, type: string, required: false, use: "checked for type" }
        - { name: keywords, type: "string[]", required: false, use: "checked for type" }
        - { name: extensions, type: object, required: false, use: "accepted; a non-object is ignored with a warning" }
    since: null
    until: null
    observed: "2026-11-05"
    source: qwen-code-agent-plugins-source
    locator: "packages/core/src/extension/agent-plugins-v1/manifest.ts:19-31, 75-150 at 1bac51b7d9e28d5c0f7d9a0a6fcd3add14443ebb"
    evidence: source
  - value:
      claude_file: .claude-plugin/plugin.json
      claude_fields_converted: [name, version, description, author.name, author.email, author.url, homepage, repository, license, keywords, dependencies, commands, agents, skills, hooks, mcpServers, workflows, outputStyles, lspServers]
    since: null
    until: null
    observed: "2026-11-05"
    source: qwen-code-claude-converter
    locator: "packages/core/src/extension/claude-converter.ts:47-65 at 1bac51b7d9e28d5c0f7d9a0a6fcd3add14443ebb"
    evidence: source
sources:
  - id: qwen-code-extensions-doc
    resource: "https://github.com/QwenLM/qwen-code/blob/1bac51b7d9e28d5c0f7d9a0a6fcd3add14443ebb/docs/users/extension/introduction.md"
    title: "Qwen Code docs: Extensions at 1bac51b"
  - id: qwen-code-source
    resource: "https://github.com/QwenLM/qwen-code/blob/1bac51b7d9e28d5c0f7d9a0a6fcd3add14443ebb/packages/core/src/extension/extensionManager.ts"
    title: "QwenLM/qwen-code extensionManager.ts at 1bac51b"
  - id: qwen-code-agent-plugins-source
    resource: "https://github.com/QwenLM/qwen-code/blob/1bac51b7d9e28d5c0f7d9a0a6fcd3add14443ebb/packages/core/src/extension/agent-plugins-v1/manifest.ts"
    title: "QwenLM/qwen-code agent-plugins-v1/manifest.ts at 1bac51b"
  - id: qwen-code-claude-converter
    resource: "https://github.com/QwenLM/qwen-code/blob/1bac51b7d9e28d5c0f7d9a0a6fcd3add14443ebb/packages/core/src/extension/claude-converter.ts"
    title: "QwenLM/qwen-code claude-converter.ts at 1bac51b"
---

What the sources say about [Plugin manifest fields](/subjects/plugins/manifest-fields.md) in
[Qwen Code](/harnesses/qwen-code.md).

Qwen Code's own manifest is `qwen-extension.json`. It also loads Agent Plugins v1 packages as
they are, and converts Claude, Gemini and Qoder manifests on install.

## Observations

- 2026-11-05: file: `qwen-extension.json`; fields: name (required), version, displayName,
  description, mcpServers, lspServers, contextFileName, commands, skills, skillStates, agents,
  workflows, settings (name, description, envVar, sensitive), hooks, channels (entry, displayName,
  requiredConfigFields).[^qwen-code-source]

  ```ts
  export interface ExtensionConfig {
    name: string;
    version: string;
    displayName?: string;
    description?: string;
    ...
    mcpServers?: Record<string, MCPServerConfig>;
    lspServers?: string | Record<string, unknown>;
    contextFileName?: string | string[];
    commands?: string | string[];
    skills?: string | string[];
    skillStates?: Record<string, boolean>;
    agents?: string | string[];
    /** Workflow directories or `.js` files; defaults to `workflows/`. */
    workflows?: string | string[];
    settings?: ExtensionSetting[];
    hooks?: { [K in HookEventName]?: HookDefinition[] };
    channels?: Record<string, ExtensionChannelConfig>;
  }
  ...
        if (!config.name) {
          throw new Error(
            `Invalid configuration in ${configFilePath}: missing "name"`,
  ```

- 2026-11-05: the docs list a subset (name, version, mcpServers, channels, contextFileName,
  commands, skills, agents, workflows, settings) and do not document displayName, description,
  lspServers, skillStates or hooks.[^qwen-code-extensions-doc]

  > - `commands`: The directory containing custom commands (default: `commands`). Commands are `.md` files that define prompts.

- 2026-11-05: Agent Plugins v1 file: root `plugin.json`; fields: $schema and name (required),
  version (default 1.0.0), description, author, homepage, repository, license, keywords,
  extensions.[^qwen-code-agent-plugins-source]

  ```ts
  const MANIFEST_FIELDS = new Set([
    '$schema',
    'name',
    'version',
    'description',
    'author',
    'homepage',
    'repository',
    'license',
    'keywords',
    'extensions',
  ]);
  const AUTHOR_FIELDS = new Set(['name', 'email', 'url']);
  ```

- 2026-11-05: Claude plugin file: `.claude-plugin/plugin.json`, converted on install; the
  converter's type lists name, version, description, author, homepage, repository, license,
  keywords, dependencies, commands, agents, skills, hooks, mcpServers, workflows, outputStyles,
  lspServers.[^qwen-code-claude-converter]

  ```ts
  export interface ClaudePluginConfig {
    name: string;
    version: string;
    description?: string;
    author?: { name?: string; email?: string; url?: string };
    homepage?: string;
    repository?: string;
    license?: string;
    keywords?: string[];
    dependencies?: unknown;
    commands?: string | string[];
    agents?: string | string[];
    skills?: string | string[];
    hooks?: string | { [K in HookEventName]?: HookDefinition[] };
    mcpServers?: string | Record<string, MCPServerConfig>;
    workflows?: string | string[];
    outputStyles?: string | string[];
    lspServers?: string | Record<string, unknown>;
  }
  ```

[^qwen-code-source]: QwenLM/qwen-code extensionManager.ts at 1bac51b
[^qwen-code-extensions-doc]: Qwen Code docs: Extensions at 1bac51b
[^qwen-code-agent-plugins-source]: QwenLM/qwen-code agent-plugins-v1/manifest.ts at 1bac51b
[^qwen-code-claude-converter]: QwenLM/qwen-code claude-converter.ts at 1bac51b
