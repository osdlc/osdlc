---
slug: proto
category: toolchain-manager
vendor: moonrepo
homepage: https://moonrepo.dev/proto
docs: https://moonrepo.dev/docs/proto
repository: https://github.com/moonrepo/proto
license: MIT
open_source: true
platforms:
- macos
- linux
- windows
cli: proto
checked: '2026-11-21'
sources:
- '[proto proto](../documents/moonrepo/proto%20proto.md)'
- '[proto FAQ](../documents/moonrepo/proto%20FAQ.md)'
- '[proto Configuration](../documents/moonrepo/proto%20Configuration.md)'
- '[proto Install proto](../documents/moonrepo/proto%20Install%20proto.md)'
- '[proto clean](../documents/moonrepo/proto%20clean.md)'
- '[proto uninstall](../documents/moonrepo/proto%20uninstall.md)'
- '[proto status](../documents/moonrepo/proto%20status.md)'
- '[proto versions](../documents/moonrepo/proto%20versions.md)'
---

proto is moonrepo's pluggable version manager for languages and tools such as Node.js, Bun, Deno, Python and Rust. Everything lives under ~/.proto: installed tool versions in tools/, downloads in temp/, an HTTP request cache in cache/, and WASM plugins.

## Open

- in use: The proto docs do not name a lock file or a way to tell that a tool version is in use, beyond proto clean's last-used age.
