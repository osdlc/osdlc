---
slug: gradle
category: build-tool
vendor: Gradle, Inc.
homepage: https://gradle.org
docs: https://docs.gradle.org/current/userguide/userguide.html
repository: https://github.com/gradle/gradle
license: Apache-2.0
open_source: true
platforms:
- macos
- linux
- windows
cli: gradle
checked: '2026-11-21'
sources:
- '[Gradle-managed Directories and Caches](../documents/Gradle/Gradle-managed%20Directories%20and%20Caches.md)'
- '[Dependency Caching](../documents/Gradle/Dependency%20Caching.md)'
- '[The Base Plugin](../documents/Gradle/The%20Base%20Plugin.md)'
- '[Gradle Gradle Daemon](../documents/Gradle/Gradle%20Gradle%20Daemon.md)'
---

Gradle is a build tool for JVM, Android and other projects. Its user home (~/.gradle) fills with downloaded dependencies, the local build cache, artifact transforms, wrapper distributions, toolchain JDKs and daemon logs, and each project gets build/ and .gradle/ directories.

## Open

- inventory command: Gradle documents no command that lists or sizes the Gradle User Home caches.
