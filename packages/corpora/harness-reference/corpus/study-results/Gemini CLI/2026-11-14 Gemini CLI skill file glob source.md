---
kind: source
reportedIn:
  - "[google-gemini gemini-cli core src skills skillLoader.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20core%20src%20skills%20skillLoader.ts%20at%205a5c718.md)"
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
version: 0.68.0
version_basis: exact
observed: 2026-11-14
locator: packages/core/src/skills/skillLoader.ts#L154 at 5a5c7180ff3f0a02511f54b54db7f228d4982a30 (loadSkillsFromDir)
excerpt:
  exact: const pattern = ['SKILL.md', '*/SKILL.md'];
  prefix: "s.isDirectory()) { return []; } "
  suffix: " const skillFiles = await glob(p"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> const pattern = ['SKILL.md', '*/SKILL.md'];
