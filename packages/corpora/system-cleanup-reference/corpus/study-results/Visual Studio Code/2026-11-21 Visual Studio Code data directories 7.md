---
kind: source
store: '[Visual Studio Code](../../stores/Visual%20Studio%20Code.md)'
observed: '2026-11-21'
locator: doGetUserDataPath
reportedIn:
- '[userDataPath.ts](../../documents/Microsoft/userDataPath.ts.md)'
excerpt:
  exact: appDataPath = process.env['XDG_CONFIG_HOME'] || join(homedir(), '.config');
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

userDataPath.ts (https://raw.githubusercontent.com/microsoft/vscode/main/src/vs/platform/environment/node/userDataPath.ts) says, under doGetUserDataPath:

> appDataPath = process.env['XDG_CONFIG_HOME'] || join(homedir(), '.config');
