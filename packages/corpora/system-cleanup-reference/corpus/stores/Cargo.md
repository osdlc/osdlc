---
slug: cargo
category: language-package-manager
vendor: The Rust Project
homepage: https://doc.rust-lang.org/cargo/
docs: https://doc.rust-lang.org/cargo/
repository: https://github.com/rust-lang/cargo
license: MIT OR Apache-2.0
open_source: true
platforms:
- macos
- linux
- windows
cli: cargo
checked: '2026-11-21'
sources:
- '[Cargo Home - The Cargo Book](../documents/The%20Rust%20Project/Cargo%20Home%20-%20The%20Cargo%20Book.md)'
- '[Environment Variables - The Cargo Book](../documents/The%20Rust%20Project/Environment%20Variables%20-%20The%20Cargo%20Book.md)'
- '[Build Cache - The Cargo Book](../documents/The%20Rust%20Project/Build%20Cache%20-%20The%20Cargo%20Book.md)'
- '[Configuration - The Cargo Book](../documents/The%20Rust%20Project/Configuration%20-%20The%20Cargo%20Book.md)'
- '[cargo clean - The Cargo Book](../documents/The%20Rust%20Project/cargo%20clean%20-%20The%20Cargo%20Book.md)'
- '[Unstable Features - The Cargo Book](../documents/The%20Rust%20Project/Unstable%20Features%20-%20The%20Cargo%20Book.md)'
- '[cargo src util cache_lock.rs](../documents/The%20Rust%20Project/cargo%20src%20util%20cache_lock.rs.md)'
---

Cargo is the Rust package manager and build tool. It keeps downloaded crate archives, their unpacked sources, registry indexes and git dependency clones in the Cargo home (~/.cargo), and writes build output to a target directory in each workspace.

## Open

- inventory command: No built-in Cargo command to list or size the global cache is documented; only the third-party cargo-cache tool is mentioned.
