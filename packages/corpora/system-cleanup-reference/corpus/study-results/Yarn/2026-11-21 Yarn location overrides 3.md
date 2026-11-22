---
kind: source
store: '[Yarn](../../stores/Yarn.md)'
observed: '2026-11-21'
locator: getDefaultGlobalFolder
version: 4.x
version_basis: exact
reportedIn:
- '[packages yarnpkg-core sources folderUtils.ts](../../documents/Yarn/packages%20yarnpkg-core%20sources%20folderUtils.ts.md)'
excerpt:
  exact: const base = npath.toPortablePath(process.env.XDG_DATA_HOME);
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

packages yarnpkg-core sources folderUtils.ts (https://raw.githubusercontent.com/yarnpkg/berry/master/packages/yarnpkg-core/sources/folderUtils.ts) says, under getDefaultGlobalFolder:

> const base = npath.toPortablePath(process.env.XDG_DATA_HOME);
