---
kind: source
store: '[Cargo](../../stores/Cargo.md)'
observed: '2026-11-21'
locator: CACHE_LOCK_NAME
reportedIn:
- '[cargo src util cache_lock.rs](../../documents/The%20Rust%20Project/cargo%20src%20util%20cache_lock.rs.md)'
excerpt:
  exact: 'const CACHE_LOCK_NAME: &str = ".package-cache";'
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

cargo src util cache_lock.rs (https://raw.githubusercontent.com/rust-lang/cargo/master/src/util/cache_lock.rs) says, under CACHE_LOCK_NAME:

> const CACHE_LOCK_NAME: &str = ".package-cache";
