---
kind: source
reportedIn:
  - "[deepseek-ai deepseek-harness shell-env index.ts at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20shell-env%20index.ts%20at%2039163dd.md)"
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
version: 0.2.2-rc.3
version_basis: inferred
observed: 2026-11-14
locator: "packages/shell/shell-env/src/index.ts#L173-L174 at 39163dd"
excerpt:
  exact: "if (execution.agent !== undefined) { values[DSH_SESSION_ID_KEY] = execution.agent.session.header.id"
  prefix: "CUTABLE_KEY] = process.execPath "
  suffix: " } const profile = this.ctx.get("
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> if (execution.agent !== undefined) { values[DSH_SESSION_ID_KEY] = execution.agent.session.header.id
