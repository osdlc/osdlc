---
kind: source
store: '[Yarn](../../stores/Yarn.md)'
observed: '2026-11-21'
locator: enableGlobalCache handling
version: 4.x
version_basis: exact
reportedIn:
- '[packages yarnpkg-core sources Configuration.ts](../../documents/Yarn/packages%20yarnpkg-core%20sources%20Configuration.ts.md)'
excerpt:
  exact: configuration.values.set(`cacheFolder`, `${configuration.get(`globalFolder`)}/cache`);
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

packages yarnpkg-core sources Configuration.ts (https://raw.githubusercontent.com/yarnpkg/berry/master/packages/yarnpkg-core/sources/Configuration.ts) says, under enableGlobalCache handling:

> configuration.values.set(`cacheFolder`, `${configuration.get(`globalFolder`)}/cache`);
