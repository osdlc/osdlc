---
kind: source
reportedIn:
  - "[google-gemini gemini-cli core src prompts snippets.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20core%20src%20prompts%20snippets.ts%20at%205a5c718.md)"
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
version: 0.68.0
version_basis: exact
observed: 2026-11-14
locator: packages/core/src/prompts/snippets.ts#L318-L322 at 5a5c7180ff3f0a02511f54b54db7f228d4982a30 (renderAgentSkills)
excerpt:
  exact: (skill) => ` <skill> <name>${skill.name}</name> <description>${skill.description}</description> <location>${skill.location}</location> </skill>`,
  prefix: " const skillsXml = skills .map( "
  suffix: " ) .join('\\n'); return ` # Avail"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> (skill) => ` <skill> <name>${skill.name}</name> <description>${skill.description}</description> <location>${skill.location}</location> </skill>`,
