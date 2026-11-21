---
slug: flutter
category: sdk
vendor: Google
homepage: https://flutter.dev
docs: https://docs.flutter.dev/reference/flutter-cli
repository: https://github.com/flutter/flutter
license: BSD-3-Clause
open_source: true
platforms:
- macos
- linux
- windows
cli: flutter
checked: '2026-11-21'
sources:
- '[Flutter cache.dart](../documents/Flutter/Flutter%20cache.dart.md)'
- '[flutter The Flutter command-line tool](../documents/Flutter/flutter%20The%20Flutter%20command-line%20tool.md)'
- '[Flutter The Pub cache](../documents/Dart/Flutter%20The%20Pub%20cache.md)'
- '[Flutter clean.dart](../documents/Flutter/Flutter%20clean.dart.md)'
- '[Package layout conventions](../documents/Dart/Package%20layout%20conventions.md)'
---

Flutter is Google's UI SDK built on Dart. The SDK keeps downloaded engine and tool artifacts in bin/cache inside the SDK checkout, uses the Dart pub cache for packages, and fills each project with build and .dart_tool directories.

## Open

- location overrides: No source documents a variable that moves bin/cache away from the SDK root; PUB_CACHE (see the Dart store) moves the package cache.
- inventory command: No documented flutter command lists cached artifacts or their sizes.
