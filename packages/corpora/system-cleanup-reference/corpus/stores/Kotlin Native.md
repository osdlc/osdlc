---
slug: kotlin-native
category: toolchain-manager
vendor: JetBrains
homepage: https://kotlinlang.org/docs/native-overview.html
docs: https://kotlinlang.org/docs/native-overview.html
repository: https://github.com/JetBrains/kotlin
license: Apache-2.0
open_source: true
platforms:
- macos
- linux
- windows
cli: kotlinc-native
checked: '2026-11-21'
sources:
- '[Tips for improving compilation time Kotlin](../documents/JetBrains/Tips%20for%20improving%20compilation%20time%20Kotlin.md)'
- '[kotlin-native HACKING.md](../documents/JetBrains/kotlin-native%20HACKING.md.md)'
---

Kotlin/Native compiles Kotlin to native binaries via LLVM, usually driven by the Kotlin Gradle plugin. On first use it downloads compiler distributions, LLVM toolchains and sysroots into ~/.konan and caches compiled platform libraries there, often several gigabytes.

## Open

- clean command: No primary source found for a command that cleans ~/.konan; deleting it is implied safe only by the docs saying it is recreated.
- in use: Kotlin/Native runs inside the Gradle daemon or konanc; no source names a lock in ~/.konan.
- build directories: No source names a project directory created by Kotlin/Native itself (as opposed to Gradle).
