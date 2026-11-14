---
kind: source
reportedIn:
  - "[google-gemini gemini-cli core src tools activate-skill.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20core%20src%20tools%20activate-skill.ts%20at%205a5c718.md)"
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
version: 0.68.0
version_basis: exact
observed: 2026-11-14
locator: packages/core/src/tools/activate-skill.ts#L143-L151 at 5a5c7180ff3f0a02511f54b54db7f228d4982a30 (execute)
excerpt:
  exact: 'llmContent: `<activated_skill name="${skillName}"> <instructions> ${skill.body} </instructions> <available_resources> ${folderStructure} </available_resources> </activated_skill>`,'
  prefix: "re( skill.location, ); return { "
  suffix: " returnDisplay: `Skill **${skill"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> llmContent: `<activated_skill name="${skillName}"> <instructions> ${skill.body} </instructions> <available_resources> ${folderStructure} </available_resources> </activated_skill>`,
