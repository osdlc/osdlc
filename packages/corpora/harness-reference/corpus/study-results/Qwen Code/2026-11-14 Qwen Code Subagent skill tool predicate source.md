---
kind: source
reportedIn:
  - "[Qwen Code source subagent-plan-tool-policy.ts at ddeba2f](../../documents/github.com/Qwen%20Code%20source%20subagent-plan-tool-policy.ts%20at%20ddeba2f.md)"
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
version: 0.27.3
version_basis: exact
observed: 2026-11-14
locator: "#L129-L157"
excerpt:
  exact: // No per-agent config inherits the whole registry. if (!toolConfig) { return true; } if (matchesAgentToolBlocklist(toolConfig.disallowedTools, ToolNames.SKILL)) { return false; }
  prefix: "Names.SKILL)) { return false; } "
  suffix: " const names = toolConfig.tools."
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> // No per-agent config inherits the whole registry. if (!toolConfig) { return true; } if (matchesAgentToolBlocklist(toolConfig.disallowedTools, ToolNames.SKILL)) { return false; }
