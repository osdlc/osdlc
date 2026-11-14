---
kind: source
reportedIn:
  - "[OpenCode source run noninteractive.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20run%20noninteractive.ts%20at%20a6b15d3.md)"
harness: "[OpenCode](../../harnesses/OpenCode.md)"
version: 2.3.0
version_basis: exact
observed: 2026-11-14
locator: "#L217-L223"
excerpt:
  exact: 'state.admission = input.client.session.prompt({ sessionID: input.sessionID, id: messageID, text: input.message, files: input.files, delivery: "steer", })'
  prefix: ") => state.ended.reject(error)) "
  suffix: " await state.admission const [pe"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> state.admission = input.client.session.prompt({ sessionID: input.sessionID, id: messageID, text: input.message, files: input.files, delivery: "steer", })
