---
slug: vcpkg
category: language-package-manager
vendor: Microsoft
homepage: https://vcpkg.io
docs: https://learn.microsoft.com/en-us/vcpkg/
repository: https://github.com/microsoft/vcpkg
license: MIT
open_source: true
platforms:
- macos
- linux
- windows
cli: vcpkg
checked: '2026-11-21'
sources:
- '[Binary caching](../documents/Microsoft/Binary%20caching.md)'
- '[Common command options](../documents/Microsoft/Common%20command%20options.md)'
- '[Environment variables 4](../documents/Microsoft/Environment%20variables%204.md)'
- '[vcpkg vcpkg remove](../documents/Microsoft/vcpkg%20vcpkg%20remove.md)'
- '[vcpkg vcpkg install](../documents/Microsoft/vcpkg%20vcpkg%20install.md)'
- '[vcpkg vcpkg list](../documents/Microsoft/vcpkg%20vcpkg%20list.md)'
- '[vcpkg Manifest mode](../documents/Microsoft/vcpkg%20Manifest%20mode.md)'
---

vcpkg is Microsoft's C and C++ package manager, which builds libraries from source. It keeps a per-user binary cache of built packages, plus downloads, buildtrees and packages directories under the vcpkg root, and installs manifest-mode dependencies into each project's vcpkg_installed directory.

## Open

- in use: No source reviewed names a vcpkg lock file or process to check before deleting its caches.
