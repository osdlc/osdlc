---
kind: source
reportedIn:
  - "[deepseek-ai deepseek-harness skill-filesystem index.ts at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20skill-filesystem%20index.ts%20at%2039163dd.md)"
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
version: 0.2.2-rc.3
version_basis: inferred
observed: 2026-11-14
locator: "packages/skill/skill-filesystem/src/index.ts#L829-L832 at 39163dd"
excerpt:
  exact: "const name = stringField(parsed.data, 'name') const description = stringField(parsed.data, 'description') if (name === undefined || description === undefined) { ctx.logger.warn(`skill file ${path} ignored: frontmatter requires name and description`)"
  prefix: "rontmatter`) return undefined } "
  suffix: " return undefined } if (!isSkill"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> const name = stringField(parsed.data, 'name') const description = stringField(parsed.data, 'description') if (name === undefined || description === undefined) { ctx.logger.warn(`skill file ${path} ignored: frontmatter requires name and description`)
