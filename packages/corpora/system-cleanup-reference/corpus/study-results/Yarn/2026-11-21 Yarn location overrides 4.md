---
kind: source
store: '[Yarn](../../stores/Yarn.md)'
observed: '2026-11-21'
locator: getCacheDir
version: '1.22'
version_basis: exact
reportedIn:
- '[src util user-dirs.js (Yarn 1)](../../documents/Yarn/src%20util%20user-dirs.js%20%28Yarn%201%29.md)'
excerpt:
  exact: return path.join(process.env.XDG_CACHE_HOME, 'yarn');
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

src util user-dirs.js (Yarn 1) (https://raw.githubusercontent.com/yarnpkg/yarn/master/src/util/user-dirs.js) says, under getCacheDir:

> return path.join(process.env.XDG_CACHE_HOME, 'yarn');
