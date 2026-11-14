---
kind: source
reportedIn:
  - "[OpenCode source session prompt.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20session%20prompt.ts%20at%20a6b15d3.md)"
harness: "[OpenCode](../../harnesses/OpenCode.md)"
version: 2.3.0
version_basis: exact
observed: 2026-11-14
locator: "#L80-L88"
excerpt:
  exact: "payload: SessionInbox.UserPayload.make({ text: input.text, agents: input.agents, files, skills: selected?.length ? selected : undefined, metadata: event.metadata, }),"
  prefix: '}), ) }) return { type: "user", '
  suffix: " delivery: event.delivery, } sat"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> payload: SessionInbox.UserPayload.make({ text: input.text, agents: input.agents, files, skills: selected?.length ? selected : undefined, metadata: event.metadata, }),
