---
kind: source
reportedIn:
  - "[deepseek-ai deepseek-harness headless index.ts at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20headless%20index.ts%20at%2039163dd.md)"
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
version: 0.2.2-rc.3
version_basis: inferred
observed: 2026-11-14
locator: "packages/bundle/headless/src/index.ts#L420-L422 at 39163dd"
excerpt:
  exact: "agent.followup(createUserMessage({ content: [{ type: 'text', text: task }], source: { kind: 'user' },"
  prefix: "lure = undefined }) try { try { "
  suffix: " })) const subagents = ctx.get('"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> agent.followup(createUserMessage({ content: [{ type: 'text', text: task }], source: { kind: 'user' },
