---
kind: source
store: '[Visual Studio Code](../../stores/Visual%20Studio%20Code.md)'
observed: '2026-11-21'
locator: '#L82'
reportedIn:
- '[environmentService.ts](../../documents/Microsoft/environmentService.ts.md)'
excerpt:
  exact: this.args.logsPath = join(this.userDataPath, 'logs', key);
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

environmentService.ts (https://raw.githubusercontent.com/microsoft/vscode/main/src/vs/platform/environment/common/environmentService.ts) says, under #L82:

> this.args.logsPath = join(this.userDataPath, 'logs', key);
