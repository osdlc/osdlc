---
kind: source
reportedIn:
  - "[google-gemini gemini-cli core src config storage.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20core%20src%20config%20storage.ts%20at%205a5c718.md)"
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
version: 0.68.0
version_basis: exact
observed: 2026-11-14
locator: packages/core/src/config/storage.ts#L352-L358 at 5a5c7180ff3f0a02511f54b54db7f228d4982a30
excerpt:
  exact: "getProjectSkillsDir(): string { return path.join(this.getGeminiDir(), 'skills'); } getProjectAgentSkillsDir(): string { return path.join(this.getAgentsDir(), 'skills'); }"
  prefix: ".getGeminiDir(), 'commands'); } "
  suffix: " getProjectAgentsDir(): string {"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> getProjectSkillsDir(): string { return path.join(this.getGeminiDir(), 'skills'); } getProjectAgentSkillsDir(): string { return path.join(this.getAgentsDir(), 'skills'); }
