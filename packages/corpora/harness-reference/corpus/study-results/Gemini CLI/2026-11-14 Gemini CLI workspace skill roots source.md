---
kind: source
reportedIn:
  - "[google-gemini gemini-cli core src skills skillManager.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20core%20src%20skills%20skillManager.ts%20at%205a5c718.md)"
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
version: 0.68.0
version_basis: exact
observed: 2026-11-14
locator: packages/core/src/skills/skillManager.ts#L89-L97 at 5a5c7180ff3f0a02511f54b54db7f228d4982a30 (discoverSkills)
excerpt:
  exact: const projectSkills = await loadSkillsFromDir( storage.getProjectSkillsDir(), ); this.addSkillsWithPrecedence(projectSkills); // 4.1 Workspace agent skills alias (.agents/skills) const projectAgentSkills = await loadSkillsFromDir( storage.getProjectAgentSkillsDir(), );
  prefix: " is not trusted.', ); return; } "
  suffix: " this.addSkillsWithPrecedence(pr"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> const projectSkills = await loadSkillsFromDir( storage.getProjectSkillsDir(), ); this.addSkillsWithPrecedence(projectSkills); // 4.1 Workspace agent skills alias (.agents/skills) const projectAgentSkills = await loadSkillsFromDir( storage.getProjectAgentSkillsDir(), );
