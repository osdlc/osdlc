---
kind: docs
store: '[Cargo](../../stores/Cargo.md)'
observed: '2026-11-21'
locator: '[cache] / Global caches'
reportedIn:
- '[Configuration - The Cargo Book](../../documents/The%20Rust%20Project/Configuration%20-%20The%20Cargo%20Book.md)'
excerpt:
  exact: It will delete files that have to be downloaded from the network if they have not been used in
    3 months. Files that can be generated without network access will be deleted if they have not been
    used in 1 month.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

Configuration - The Cargo Book (https://doc.rust-lang.org/cargo/reference/config.html) says, under [cache] / Global caches:

> It will delete files that have to be downloaded from the network if they have not been used in 3 months. Files that can be generated without network access will be deleted if they have not been used in 1 month.
