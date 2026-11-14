---
kind: source
reportedIn:
  - "[deepseek-ai deepseek-harness skill-filesystem index.ts at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20skill-filesystem%20index.ts%20at%2039163dd.md)"
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
version: 0.2.2-rc.3
version_basis: inferred
observed: 2026-11-14
locator: "packages/skill/skill-filesystem/src/index.ts#L846-L854 at 39163dd"
excerpt:
  exact: "return { name, description, ...optionalString(parsed.data, 'whenToUse'), invocation, ...optionalMetadata(parsed.data), path: raw.path, content: parsed.body.trim(), }"
  prefix: "ge(error)}`) return undefined } "
  suffix: " } function optionalFileSystem(c"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> return { name, description, ...optionalString(parsed.data, 'whenToUse'), invocation, ...optionalMetadata(parsed.data), path: raw.path, content: parsed.body.trim(), }
