---
slug: volta
category: toolchain-manager
vendor: The Volta Contributors
homepage: https://volta.sh
docs: https://docs.volta.sh
repository: https://github.com/volta-cli/volta
license: BSD-2-Clause
open_source: true
platforms:
- macos
- linux
- windows
cli: volta
checked: '2026-11-21'
sources:
- '[Volta Installers](../documents/Volta/Volta%20Installers.md)'
- '[crates volta-layout src v4.rs](../documents/Volta/crates%20volta-layout%20src%20v4.rs.md)'
- '[Understanding Volta](../documents/Volta/Understanding%20Volta.md)'
- '[volta uninstall](../documents/Volta/volta%20uninstall.md)'
- '[crates volta-core src tool mod.rs](../documents/Volta/crates%20volta-core%20src%20tool%20mod.rs.md)'
- '[crates volta-core src error kind.rs](../documents/Volta/crates%20volta-core%20src%20error%20kind.rs.md)'
- '[Volta volta list](../documents/Volta/Volta%20volta%20list.md)'
- '[crates volta-core src sync.rs](../documents/Volta/crates%20volta-core%20src%20sync.rs.md)'
---

Volta is a Rust-based JavaScript tool manager that pins Node.js, npm, Yarn and pnpm per project; it is now unmaintained and recommends migrating to mise. It keeps downloaded archives in tools/inventory and unpacked versions in tools/image under VOLTA_HOME, and has no command to remove Node.js versions.
