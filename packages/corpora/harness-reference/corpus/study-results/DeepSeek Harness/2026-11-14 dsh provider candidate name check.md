---
kind: source
reportedIn:
  - "[deepseek-ai deepseek-harness skill index.ts at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20skill%20index.ts%20at%2039163dd.md)"
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
version: 0.2.2-rc.3
version_basis: inferred
observed: 2026-11-14
locator: "packages/skill/skill/src/index.ts#L714-L715 at 39163dd"
excerpt:
  exact: "if (!SKILL_NAME.test(candidate.name)) { throw new SkillError(`skill provider \"${providerName}\" returned invalid skill name \"${candidate.name}\"`, 'SKILL_INVALID_DEFINITION')"
  prefix: ", 'SKILL_INVALID_DEFINITION') } "
  suffix: " } if (typeof candidate.descript"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> if (!SKILL_NAME.test(candidate.name)) { throw new SkillError(`skill provider "${providerName}" returned invalid skill name "${candidate.name}"`, 'SKILL_INVALID_DEFINITION')
