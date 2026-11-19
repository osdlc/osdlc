---
kind: source
reportedIn:
  - "[OpenCode source config plugin skill.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20config%20plugin%20skill.ts%20at%20a6b15d3.md)"
harness: "[OpenCode](../../harnesses/OpenCode.md)"
version: 2.3.0
version_basis: exact
observed: 2026-11-14
locator: "#L168-L175"
excerpt:
  exact: // Editor saves arrive as bursts of watcher events; settle before rescanning once. Subscribe // before debouncing so no update slips through while the debounce starts its pull. const updates = yield* PubSub.subscribe(changes) yield* Stream.fromSubscription(updates).pipe( Stream.debounce("100 millis"), Stream.runForEach((file) => refresh(file).pipe(Effect.andThen(ctx.skill.reload()))),
  prefix: ") => lock.withPermit(effect), ) "
  suffix: " Effect.forkScoped({ startImmedi"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> // Editor saves arrive as bursts of watcher events; settle before rescanning once. Subscribe // before debouncing so no update slips through while the debounce starts its pull. const updates = yield* PubSub.subscribe(changes) yield* Stream.fromSubscription(updates).pipe( Stream.debounce("100 millis"), Stream.runForEach((file) => refresh(file).pipe(Effect.andThen(ctx.skill.reload()))),
