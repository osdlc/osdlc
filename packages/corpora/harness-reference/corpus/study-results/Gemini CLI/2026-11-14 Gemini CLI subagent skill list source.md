---
kind: source
reportedIn:
  - "[google-gemini gemini-cli core src agents local-executor.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20core%20src%20agents%20local-executor.ts%20at%205a5c718.md)"
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
version: 0.68.0
version_basis: exact
observed: 2026-11-14
locator: packages/core/src/agents/local-executor.ts#L1442-L1444 at 5a5c7180ff3f0a02511f54b54db7f228d4982a30 (buildSystemPrompt)
excerpt:
  exact: // Inject skill SI if ACTIVATE_SKILL_TOOL_NAME is available to this agent. if (this.toolRegistry.getTool(ACTIVATE_SKILL_TOOL_NAME) !== undefined) { const skills = this.context.config.getSkillManager().getSkills();
  prefix: "ptConfig.systemPrompt, inputs); "
  suffix: " if (skills.length > 0) { const "
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> // Inject skill SI if ACTIVATE_SKILL_TOOL_NAME is available to this agent. if (this.toolRegistry.getTool(ACTIVATE_SKILL_TOOL_NAME) !== undefined) { const skills = this.context.config.getSkillManager().getSkills();
