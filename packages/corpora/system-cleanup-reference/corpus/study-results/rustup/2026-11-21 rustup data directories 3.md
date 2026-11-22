---
kind: source
store: '[rustup](../../stores/rustup.md)'
observed: '2026-11-21'
locator: '#L389-L391'
reportedIn:
- '[rustup src config.rs](../../documents/rustup/rustup%20src%20config.rs.md)'
excerpt:
  exact: let download_dir = rustup_dir.join("downloads");
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

rustup src config.rs (https://raw.githubusercontent.com/rust-lang/rustup/main/src/config.rs) says, under #L389-L391:

> let download_dir = rustup_dir.join("downloads");
