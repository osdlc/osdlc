---
slug: ccache
category: build-tool
vendor: ccache project
homepage: https://ccache.dev
docs: https://ccache.dev/manual/latest.html
repository: https://github.com/ccache/ccache
license: GPL-3.0-or-later
open_source: true
platforms:
- macos
- linux
- windows
cli: ccache
checked: '2026-11-21'
sources:
- '[ccache ccache(1)](../documents/ccache/ccache%20ccache%281%29.md)'
---

ccache is a compiler cache for C, C++ and similar languages that stores compiled outputs so identical recompiles are fast. Its cache is capped by max_size (5 GiB by default) and lives in a per-user cache directory.

## Open

- in use: The manual reviewed names no lock file or daemon a cleaner should check; ccache runs only as a short-lived compiler wrapper.
- build directories: No source names a directory ccache creates inside a project; it stores everything in its cache directory.
