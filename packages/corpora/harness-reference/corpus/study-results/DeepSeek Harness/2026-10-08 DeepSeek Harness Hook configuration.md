---
kind: source
reportedIn:
  - "[DeepSeek Harness (dsh) harness notes for a dispatcher](../../documents/skillwright/DeepSeek%20Harness%20%28dsh%29%20harness%20notes%20for%20a%20dispatcher.md)"
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
version: 0.2.1-alpha.1
version_basis: exact
observed: 2026-10-08
locator: deepseek-ai/deepseek-harness packages/hooks/hooks-claude-code/README.md at 5badb150
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-08T00:00:00Z
imported_from: fact:hooks/config@dsh#observation-1
---

Imported from `facts/dsh/hooks/config.md`, observation 1.

- kind: "bridge that runs an unmodified Claude Code hooks.json (a Codex bridge exists too)"
- enabled_by_default: false
- config: "a YAML row with configPath, pluginRoot, projectDir"

Matchers apply to dsh's tool names, not Claude's.
