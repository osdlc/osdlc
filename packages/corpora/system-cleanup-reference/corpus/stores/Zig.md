---
slug: zig
category: sdk
vendor: Zig Software Foundation
homepage: https://ziglang.org
docs: https://ziglang.org/documentation/master/
repository: https://codeberg.org/ziglang/zig
license: MIT
open_source: true
platforms:
- macos
- linux
- windows
cli: zig
checked: '2026-11-21'
sources:
- '[lib std zig.zig](../documents/Zig%20Software%20Foundation/lib%20std%20zig.zig.md)'
- '[Zig src main.zig](../documents/Zig%20Software%20Foundation/Zig%20src%20main.zig.md)'
- '[Zig Build System](../documents/Zig%20Software%20Foundation/Zig%20Build%20System.md)'
---

Zig is a systems programming language and toolchain that also compiles C and C++. It keeps a global cache of compiled artifacts and fetched packages, and each project gets a .zig-cache directory and a zig-out install prefix.

## Open

- clean command: No source names a zig command that cleans or prunes the global or local cache; the build-system guide only says the local .zig-cache can be deleted.
- in use: No source reviewed names a Zig lock file or process to check before deleting its caches.
