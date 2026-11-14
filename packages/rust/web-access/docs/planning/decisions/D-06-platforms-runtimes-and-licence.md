---
id: D-06
type: decision
state: accepted
created: 2026-11-07
---

# D-06: Platforms, runtimes and licence

## Decision

- Linux, macOS and Windows are supported. CI runs the tests on each.
- Rust 1.89 or newer, from the workspace `rust-version`. The guard and the
  server run on Tokio through axum.
- On Windows the token files get no owner-only mode. They rely on the token
  directory's permissions, and the README says to keep it in the user's own
  profile.
- The licence is `MIT OR Apache-2.0`, like every crate in this repository.
- The crate forbids `unsafe` code.

## Why

- Apps that share themselves run on all three desktop platforms.
- Windows has no file mode bits. A per-user directory under the profile is
  readable only by that user by default.

## Consequences

- [T-07](../tasks/T-07-token-file-hardening.md) tracks setting an owner-only
  ACL on Windows and the other token-file gaps.
