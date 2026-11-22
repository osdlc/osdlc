---
slug: coursier
category: language-package-manager
vendor: coursier contributors (Scala Center / VirtusLab)
homepage: https://get-coursier.io
docs: https://get-coursier.io/docs/overview
repository: https://github.com/coursier/coursier
license: Apache-2.0
open_source: true
platforms:
- macos
- linux
- windows
cli: cs
checked: '2026-11-21'
sources:
- '[Cache Coursier](../documents/coursier/Cache%20Coursier.md)'
- '[Coursier java Coursier](../documents/coursier/Coursier%20java%20Coursier.md)'
- '[install Coursier](../documents/coursier/install%20Coursier.md)'
- '[Deleting cache 1911](../documents/coursier/Deleting%20cache%201911.md)'
---

Coursier is a Scala/JVM artifact fetcher used by sbt, Mill and Scala CLI, and a launcher (cs) that installs Scala apps and JVMs. It fills disks with a cache of every downloaded Maven artifact and with managed JDKs.

## Open

- in use: Coursier has no daemon; whether it uses lock files inside the cache that a cleaner should honour is not documented in the pages read.
- build directories: No source names a project-local directory created by Coursier itself.
