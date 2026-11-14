---
kind: source
reportedIn:
  - "[OpenCode source plugin promise session.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20plugin%20promise%20session.ts%20at%20a6b15d3.md)"
harness: "[OpenCode](../../harnesses/OpenCode.md)"
version: 2.3.0
version_basis: exact
observed: 2026-11-14
locator: "#L201-L217"
excerpt:
  exact: 'export interface SessionHooks { readonly fork: { readonly sessionID: Session.ID } readonly prompt: SessionPrompt readonly context: SessionContext readonly compaction: SessionCompaction readonly generate: SessionGenerate readonly title: SessionTitle readonly "experimental.model.resolve": SessionModelResolve readonly "model.request": SessionModelRequest readonly "http.request": SessionHttpRequest readonly "http.response": SessionHttpResponse readonly "experimental.ws.handshake": SessionWebSocketHandshake readonly "experimental.ws.send": SessionWebSocketSend readonly "experimental.ws.receive": SessionWebSocketReceive readonly retry: SessionRetry readonly "experimental.idle": SessionIdle }'
  prefix: "yArray<SessionIdleBackground> } "
  suffix: " export type SessionDomain = Pic"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> export interface SessionHooks { readonly fork: { readonly sessionID: Session.ID } readonly prompt: SessionPrompt readonly context: SessionContext readonly compaction: SessionCompaction readonly generate: SessionGenerate readonly title: SessionTitle readonly "experimental.model.resolve": SessionModelResolve readonly "model.request": SessionModelRequest readonly "http.request": SessionHttpRequest readonly "http.response": SessionHttpResponse readonly "experimental.ws.handshake": SessionWebSocketHandshake readonly "experimental.ws.send": SessionWebSocketSend readonly "experimental.ws.receive": SessionWebSocketReceive readonly retry: SessionRetry readonly "experimental.idle": SessionIdle }
