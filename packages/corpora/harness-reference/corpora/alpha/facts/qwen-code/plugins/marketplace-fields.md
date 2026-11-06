---
type: Harness Fact
title: "Qwen Code: Marketplace fields"
description: "Marketplace fields in Qwen Code, as observed over time."
tags: [plugins]
harness: qwen-code
subject: plugins/marketplace-fields
observations:
  - value:
      file: .claude-plugin/marketplace.json
      fields:
        - { name: name, type: string, required: true, use: "marketplace name shown in Discover" }
        - { name: owner.name, type: string, required: true, use: "not documented" }
        - { name: owner.email, type: string, required: true, use: "not documented" }
        - { name: plugins, type: array, required: true, use: "plugin entries" }
        - { name: metadata.description, type: string, required: false, use: "not documented" }
        - { name: metadata.version, type: string, required: false, use: "not documented" }
        - { name: metadata.pluginRoot, type: string, required: false, use: "declared in the type; relative sources resolve from the marketplace directory, not from it" }
      entry_fields:
        - { name: name, type: string, required: true, use: "plugin name; the part after : in an install spec" }
        - { name: source, type: "string | object", required: true, use: "where the plugin comes from; a string is a relative path or an http(s) git URL" }
        - { name: source.repo, type: string, required: "conditional", use: "GitHub owner/repo", note: "For source github." }
        - { name: source.url, type: string, required: "conditional", use: "git URL", note: "For source url and git-subdir." }
        - { name: source.path, type: string, required: "conditional", use: "subdirectory in the repository", note: "For source git-subdir." }
        - { name: source.ref, type: string, required: false, use: "git ref (git-subdir)" }
        - { name: source.sha, type: string, required: false, use: "git commit, used before ref (git-subdir)" }
        - { name: strict, type: boolean, required: false, use: "true requires the plugin's own plugin.json; default false merges the entry with it" }
        - { name: category, type: string, required: false, use: "shown in Discover" }
        - { name: tags, type: "string[]", required: false, use: "not documented" }
        - { name: description, type: string, required: false, use: "shown in Discover" }
        - { name: version, type: string, required: false, use: "shown in Discover" }
        - { name: author.name, type: string, required: false, use: "shown in Discover" }
        - { name: homepage, type: string, required: false, use: "shown in Discover" }
        - { name: lastUpdated, type: string, required: false, use: "shown in Discover; also read as updatedAt or updated" }
        - { name: installs, type: number, required: false, use: "shown in Discover; also read as installCount or downloads" }
      other_entry_fields: "an entry also takes every Claude plugin.json field, merged into the converted manifest"
      source_forms: [relative path string, http(s) URL string, github, url, git-subdir]
    since: null
    until: null
    observed: "2026-11-05"
    source: qwen-code-claude-converter
    locator: "packages/core/src/extension/claude-converter.ts:96-120, 520-530, 1048-1060, 1150-1300; sourceRegistry.ts:105-123, 222-245 at 1bac51b7d9e28d5c0f7d9a0a6fcd3add14443ebb"
    evidence: source
sources:
  - id: qwen-code-claude-converter
    resource: "https://github.com/QwenLM/qwen-code/blob/1bac51b7d9e28d5c0f7d9a0a6fcd3add14443ebb/packages/core/src/extension/claude-converter.ts"
    title: "QwenLM/qwen-code claude-converter.ts at 1bac51b"
---

What the sources say about [Marketplace fields](/subjects/plugins/marketplace-fields.md) in
[Qwen Code](/harnesses/qwen-code.md).

Qwen Code reads Claude Code marketplaces. It has no marketplace format of its own.

## Observations

- 2026-11-05: file: `.claude-plugin/marketplace.json`; fields: name, owner.name, owner.email,
  plugins, metadata.description, metadata.version, metadata.pluginRoot; entry fields: name,
  source, strict, category, tags, plus every Claude plugin.json field, and lastUpdated and installs
  read for display. Source forms: a relative path or http(s) URL string, github, url,
  git-subdir.[^qwen-code-claude-converter]

  ```ts
  export type ClaudePluginSource =
    | { source: 'github'; repo: string }
    | { source: 'url'; url: string }
    | {
        source: 'git-subdir';
        url: string;
        path: string;
        ref?: string;
        sha?: string;
      };

  export interface ClaudeMarketplacePluginConfig extends ClaudePluginConfig {
    source: string | ClaudePluginSource;
    category?: string;
    strict?: boolean;
    tags?: string[];
  }

  export interface ClaudeMarketplaceConfig {
    name: string;
    owner: { name: string; email: string };
    plugins: ClaudeMarketplacePluginConfig[];
    metadata?: { description?: string; version?: string; pluginRoot?: string };
  }
  ...
      const pluginRoot = marketplaceDir;
      const sourcePath = path.join(pluginRoot, source);
  ```

  `metadata.pluginRoot` is declared but the relative-path branch joins the source to the
  marketplace directory, so the field has no effect in the code read.

[^qwen-code-claude-converter]: QwenLM/qwen-code claude-converter.ts at 1bac51b
