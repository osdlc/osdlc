---
slug: bazel
category: build-tool
vendor: Google
homepage: https://bazel.build
docs: https://bazel.build/docs
repository: https://github.com/bazelbuild/bazel
license: Apache-2.0
open_source: true
platforms:
- macos
- linux
- windows
cli: bazel
checked: '2026-11-21'
sources:
- '[Output Directory Layout](../documents/Bazel/Output%20Directory%20Layout.md)'
- '[Build programs with Bazel](../documents/Bazel/Build%20programs%20with%20Bazel.md)'
- '[Remote Caching](../documents/Bazel/Remote%20Caching.md)'
- '[Commands and Options](../documents/Bazel/Commands%20and%20Options.md)'
- '[External dependencies overview](../documents/Bazel/External%20dependencies%20overview.md)'
---

Bazel is Google's multi-language build and test tool. It writes all build output, fetched external repositories and its own install files under a per-user output root (one output base per workspace), plus a shared repository cache and an optional disk cache that can each grow to many gigabytes.
