---
kind: source
reportedIn:
  - "[deepseek-ai deepseek-harness skill-filesystem index.ts at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20skill-filesystem%20index.ts%20at%2039163dd.md)"
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
version: 0.2.2-rc.3
version_basis: inferred
observed: 2026-11-14
locator: "packages/skill/skill-filesystem/src/index.ts#L1019-L1024 at 39163dd"
excerpt:
  exact: "const disableModelInvocation = frontmatterBoolean(data, 'disable-model-invocation') const userInvocable = frontmatterBoolean(data, 'user-invocable') return { modelInvocable: disableModelInvocation !== true, userInvocable: userInvocable !== false, }"
  prefix: "erInvocable', 'user-invocable') "
  suffix: " } function rejectLegacyInvocati"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> const disableModelInvocation = frontmatterBoolean(data, 'disable-model-invocation') const userInvocable = frontmatterBoolean(data, 'user-invocable') return { modelInvocable: disableModelInvocation !== true, userInvocable: userInvocable !== false, }
