---
kind: docs
store: '[Cargo](../../stores/Cargo.md)'
observed: '2026-11-21'
locator: '[cache] / Global caches'
reportedIn:
- '[Configuration - The Cargo Book](../../documents/The%20Rust%20Project/Configuration%20-%20The%20Cargo%20Book.md)'
excerpt:
  exact: The automatic deletion of files only occurs when running commands that are already doing a significant
    amount of work, such as all of the build commands
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

Configuration - The Cargo Book (https://doc.rust-lang.org/cargo/reference/config.html) says, under [cache] / Global caches:

> The automatic deletion of files only occurs when running commands that are already doing a significant amount of work, such as all of the build commands
