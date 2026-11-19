---
kind: source
reportedIn:
  - "[deepseek-ai deepseek-harness hooks-claude-code config.ts at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20hooks-claude-code%20config.ts%20at%2039163dd.md)"
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
version: 0.2.2-rc.3
version_basis: inferred
observed: 2026-11-14
locator: "packages/experimental/hooks-claude-code/src/config.ts#L59 at 39163dd"
excerpt:
  exact: "if (vars.pluginRoot !== undefined) out = out.split('${CLAUDE_PLUGIN_ROOT}').join(vars.pluginRoot)"
  prefix: "rs): string { let out = command "
  suffix: " if (vars.projectDir !== undefin"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> if (vars.pluginRoot !== undefined) out = out.split('${CLAUDE_PLUGIN_ROOT}').join(vars.pluginRoot)
