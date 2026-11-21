---
kind: source
store: '[Zed](../../stores/Zed.md)'
observed: '2026-11-21'
locator: remote_servers_dir
reportedIn:
- '[crates paths src paths.rs](../../documents/Zed%20Industries/crates%20paths%20src%20paths.rs.md)'
excerpt:
  exact: REMOTE_SERVERS_DIR.get_or_init(|| data_dir().join("remote_servers"))
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

crates paths src paths.rs (https://raw.githubusercontent.com/zed-industries/zed/main/crates/paths/src/paths.rs) says, under remote_servers_dir:

> REMOTE_SERVERS_DIR.get_or_init(|| data_dir().join("remote_servers"))
