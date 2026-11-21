---
kind: source
store: '[Zed](../../stores/Zed.md)'
observed: '2026-11-21'
locator: data_dir
reportedIn:
- '[crates paths src paths.rs](../../documents/Zed%20Industries/crates%20paths%20src%20paths.rs.md)'
excerpt:
  exact: dirs::data_local_dir().expect("failed to determine XDG_DATA_HOME directory")
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

crates paths src paths.rs (https://raw.githubusercontent.com/zed-industries/zed/main/crates/paths/src/paths.rs) says, under data_dir:

> dirs::data_local_dir().expect("failed to determine XDG_DATA_HOME directory")
