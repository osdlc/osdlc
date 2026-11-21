---
slug: swift-package-manager
category: build-tool
vendor: Swift project (swiftlang)
homepage: https://www.swift.org/documentation/package-manager/
docs: https://docs.swift.org/swiftpm/documentation/packagemanagerdocs/
repository: https://github.com/swiftlang/swift-package-manager
license: Apache-2.0
open_source: true
platforms:
- macos
- linux
- windows
cli: swift
checked: '2026-11-21'
sources:
- '[Troubleshooting artifact bundles](../documents/Swift%20project/Troubleshooting%20artifact%20bundles.md)'
- '[FileSystem+Extensions.swift](../documents/Swift%20project/FileSystem%2BExtensions.swift.md)'
- '[swift package clean](../documents/Swift%20project/swift%20package%20clean.md)'
- '[Swift Package Manager Build Caching](../documents/Swift%20project/Swift%20Package%20Manager%20Build%20Caching.md)'
- '[swift package reset](../documents/Swift%20project/swift%20package%20reset.md)'
- '[swift package purge-cache](../documents/Swift%20project/swift%20package%20purge-cache.md)'
- '[Getting Started](../documents/Swift%20project/Getting%20Started.md)'
- '[Creating a Swift package](../documents/Swift%20project/Creating%20a%20Swift%20package.md)'
---

SwiftPM is the package manager and build system bundled with the Swift toolchain. It keeps a shared cache of cloned package repositories in the user's caches directory and puts dependency checkouts and build products in each package's .build directory.

## Open

- inventory command: No SwiftPM command documented for listing the shared cache contents or sizes was found.
- in use: SwiftPM's source acquires an exclusive lock on the build (scratch) directory before creating the workspace, but the quotable source does not settle the lock file's exact name or the process names to check.
