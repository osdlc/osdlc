---
slug: dart
category: language-package-manager
vendor: Google
homepage: https://dart.dev
docs: https://dart.dev/tools/pub/cmd/pub-cache
repository: https://github.com/dart-lang/pub
license: BSD-3-Clause
open_source: true
platforms:
- macos
- linux
- windows
cli: dart
checked: '2026-11-21'
sources:
- '[Pub environment variables](../documents/Dart/Pub%20environment%20variables.md)'
- '[system_cache.dart](../documents/Dart/system_cache.dart.md)'
- '[dart pub cache](../documents/Dart/dart%20pub%20cache.md)'
- '[Dart cache_gc.dart](../documents/Dart/Dart%20cache_gc.dart.md)'
- '[Package layout conventions](../documents/Dart/Package%20layout%20conventions.md)'
- '[What not to commit](../documents/Dart/What%20not%20to%20commit.md)'
---

Dart's package manager, pub (run as dart pub), downloads packages into a shared system cache, the pub cache. Each project also gets a .dart_tool directory of tool caches and, for some tools, a build directory.

## Open

- inventory command: pub's source has a cache list subcommand but marks it hidden; no documented command lists cache contents or sizes.
- in use: No source names a pub lock file or process to check before deleting the pub cache.
