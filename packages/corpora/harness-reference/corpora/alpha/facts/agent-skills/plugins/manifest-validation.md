---
type: Harness Fact
title: "Agent Skills (agentskills.io): Plugin manifest validation"
description: "Plugin manifest validation in Agent Skills (agentskills.io), as observed over time."
tags: [plugins]
harness: agent-skills
subject: plugins/manifest-validation
observations:
  - value:
      applicable: false
      skill_validator: "skills-ref validate <skill dir> checks SKILL.md frontmatter, not a plugin manifest"
    since: null
    until: null
    observed: "2026-11-05"
    source: agent-skills-spec
    locator: "docs/specification.mdx:239-247 at 83021e2be457a9b6679148719c1f6074f0ad975e"
    evidence: inferred
    note: "No plugin manifest exists in the standard, so there is nothing of this kind to validate."
sources:
  - id: agent-skills-spec
    resource: "https://github.com/agentskills/agentskills/blob/83021e2be457a9b6679148719c1f6074f0ad975e/docs/specification.mdx"
    title: "Agent Skills specification"
---

What the sources say about [Plugin manifest validation](/subjects/plugins/manifest-validation.md)
in [Agent Skills (agentskills.io)](/harnesses/agent-skills.md).

## Observations

- 2026-11-05: applicable: `false`. The standard's validator checks a skill, not a plugin
  manifest.[^agent-skills-spec]

  > Use the [skills-ref](https://github.com/agentskills/agentskills/tree/main/skills-ref) reference library to validate your skills:
  >
  > ```bash
  > skills-ref validate ./my-skill
  > ```
  >
  > This checks that your `SKILL.md` frontmatter is valid and follows all naming conventions.

[^agent-skills-spec]: Agent Skills specification
