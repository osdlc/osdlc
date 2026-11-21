---
slug: rustup
category: toolchain-manager
vendor: The Rust Project
homepage: https://rustup.rs
docs: https://rust-lang.github.io/rustup/
repository: https://github.com/rust-lang/rustup
license: MIT OR Apache-2.0
open_source: true
platforms:
- macos
- linux
- windows
cli: rustup
checked: '2026-11-21'
sources:
- '[Environment variables 6](../documents/rustup/Environment%20variables%206.md)'
- '[rustup src config.rs](../documents/rustup/rustup%20src%20config.rs.md)'
- '[rustup Installation](../documents/rustup/rustup%20Installation.md)'
- '[src cli rustup_mode.rs](../documents/rustup/src%20cli%20rustup_mode.rs.md)'
- '[rustup Examples](../documents/rustup/rustup%20Examples.md)'
---

rustup is the Rust toolchain installer and manager. It keeps every installed toolchain (stable, beta, nightly, dated nightlies, extra targets and components) under ~/.rustup/toolchains, which grows by several hundred MB per toolchain, plus a downloads directory.

## Open

- in use: The rustup docs do not name a lock file or a way to tell that a toolchain is in use.
