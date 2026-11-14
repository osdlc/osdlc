---
kind: source
reportedIn:
  - "[OpenCode source util npm.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20util%20npm.ts%20at%20a6b15d3.md)"
harness: "[OpenCode](../../harnesses/OpenCode.md)"
version: 2.3.0
version_basis: exact
observed: 2026-11-14
locator: "#L148"
excerpt:
  exact: 'const directory = (pkg: string, target: Target | undefined) => path.join(global.cache, "npm", key(pkg, target))'
  prefix: "ck = yield* EffectFlock.Service "
  suffix: " const generations = Effect.fnUn"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> const directory = (pkg: string, target: Target | undefined) => path.join(global.cache, "npm", key(pkg, target))
