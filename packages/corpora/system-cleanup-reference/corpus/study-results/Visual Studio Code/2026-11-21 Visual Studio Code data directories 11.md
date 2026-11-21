---
kind: source
store: '[Visual Studio Code](../../stores/Visual%20Studio%20Code.md)'
observed: '2026-11-21'
locator: '#L133'
reportedIn:
- '[environmentService.ts](../../documents/Microsoft/environmentService.ts.md)'
excerpt:
  exact: return URI.file(join(this.userDataPath, 'CachedExtensionVSIXs'));
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

environmentService.ts (https://raw.githubusercontent.com/microsoft/vscode/main/src/vs/platform/environment/common/environmentService.ts) says, under #L133:

> return URI.file(join(this.userDataPath, 'CachedExtensionVSIXs'));
