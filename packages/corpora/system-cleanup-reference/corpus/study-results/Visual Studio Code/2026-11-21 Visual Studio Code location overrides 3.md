---
kind: source
store: '[Visual Studio Code](../../stores/Visual%20Studio%20Code.md)'
observed: '2026-11-21'
locator: getUserDataPath
reportedIn:
- '[userDataPath.ts](../../documents/Microsoft/userDataPath.ts.md)'
excerpt:
  exact: respect VSCODE_APPDATA environment variable
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

userDataPath.ts (https://raw.githubusercontent.com/microsoft/vscode/main/src/vs/platform/environment/node/userDataPath.ts) says, under getUserDataPath:

> respect VSCODE_APPDATA environment variable
