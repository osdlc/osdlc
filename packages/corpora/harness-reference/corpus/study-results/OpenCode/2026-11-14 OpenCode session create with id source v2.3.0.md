---
kind: source
reportedIn:
  - "[OpenCode source cli session-target.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20cli%20session-target.ts%20at%20a6b15d3.md)"
harness: "[OpenCode](../../harnesses/OpenCode.md)"
version: 2.3.0
version_basis: exact
observed: 2026-11-14
locator: "#L62-L73"
excerpt:
  exact: "(await input.client.session .create( { id: input.session, agent: prepared.agent, model: prepared.model, location: { directory: location.directory }, },"
  prefix: " }) const session = selected ?? "
  suffix: " ...requestOptions(input.signal)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> (await input.client.session .create( { id: input.session, agent: prepared.agent, model: prepared.model, location: { directory: location.directory }, },
