---
kind: source
reportedIn:
  - "[google-gemini gemini-cli cli src services SkillCommandLoader.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20cli%20src%20services%20SkillCommandLoader.ts%20at%205a5c718.md)"
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
version: 0.68.0
version_basis: exact
observed: 2026-11-14
locator: packages/cli/src/services/SkillCommandLoader.ts#L38 at 5a5c7180ff3f0a02511f54b54db7f228d4982a30 (loadCommands)
excerpt:
  exact: const commandName = skill.name.trim().replace(/\s+/g, '-');
  prefix: " return skills.map((skill) => { "
  suffix: " return { name: commandName, des"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> const commandName = skill.name.trim().replace(/\s+/g, '-');
