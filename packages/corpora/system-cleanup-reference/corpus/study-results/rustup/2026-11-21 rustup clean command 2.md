---
kind: source
store: '[rustup](../../stores/rustup.md)'
observed: '2026-11-21'
locator: update()
reportedIn:
- '[src cli rustup_mode.rs](../../documents/rustup/src%20cli%20rustup_mode.rs.md)'
excerpt:
  exact: info!("cleaning up downloads & tmp directories");
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

src cli rustup_mode.rs (https://raw.githubusercontent.com/rust-lang/rustup/main/src/cli/rustup_mode.rs) says, under update():

> info!("cleaning up downloads & tmp directories");
