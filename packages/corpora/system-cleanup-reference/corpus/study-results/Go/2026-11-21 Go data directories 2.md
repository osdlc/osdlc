---
kind: docs
store: '[Go](../../stores/Go.md)'
observed: '2026-11-21'
locator: func UserCacheDir
reportedIn:
- '[Go os package](../../documents/The%20Go%20Authors/Go%20os%20package.md)'
excerpt:
  exact: On Darwin, it returns $HOME/Library/Caches. On Windows, it returns %LocalAppData%.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

Go os package (https://pkg.go.dev/os) says, under func UserCacheDir:

> On Darwin, it returns $HOME/Library/Caches. On Windows, it returns %LocalAppData%.
