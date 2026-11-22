---
kind: source
store: '[Volta](../../stores/Volta.md)'
observed: '2026-11-21'
locator: '#L75'
reportedIn:
- '[crates volta-core src sync.rs](../../documents/Volta/crates%20volta-core%20src%20sync.rs.md)'
excerpt:
  exact: let path = volta_home()?.root().join(LOCK_FILE);
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

crates volta-core src sync.rs (https://raw.githubusercontent.com/volta-cli/volta/main/crates/volta-core/src/sync.rs) says, under #L75:

> let path = volta_home()?.root().join(LOCK_FILE);
