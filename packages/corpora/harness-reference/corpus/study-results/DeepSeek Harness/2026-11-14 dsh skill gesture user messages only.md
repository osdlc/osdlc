---
kind: source
reportedIn:
  - "[deepseek-ai deepseek-harness tool-skill index.ts at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20tool-skill%20index.ts%20at%2039163dd.md)"
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
version: 0.2.2-rc.3
version_basis: inferred
observed: 2026-11-14
locator: "packages/skill/tool-skill/src/index.ts#L442 at 39163dd"
excerpt:
  exact: "if ((message.source as { kind?: unknown }).kind !== 'user') continue"
  prefix: "r (const message of messages) { "
  suffix: " for (const block of message.con"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> if ((message.source as { kind?: unknown }).kind !== 'user') continue
