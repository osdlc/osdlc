---
slug: sbt
category: build-tool
vendor: Scala Center / Lightbend
homepage: https://www.scala-sbt.org
docs: https://www.scala-sbt.org/1.x/docs/
repository: https://github.com/sbt/sbt
license: Apache-2.0
open_source: true
platforms:
- macos
- linux
- windows
cli: sbt
checked: '2026-11-21'
sources:
- '[Command Line Reference](../documents/sbt/Command%20Line%20Reference.md)'
- '[Library Management](../documents/sbt/Library%20Management.md)'
- '[Cache Coursier](../documents/coursier/Cache%20Coursier.md)'
- '[sbt sbt Server](../documents/sbt/sbt%20sbt%20Server.md)'
- '[Directory structure](../documents/sbt/Directory%20structure.md)'
---

sbt is the main build tool for Scala projects. It keeps its launcher, Scala compiler and global plugins under ~/.sbt, an Ivy cache under ~/.ivy2, and (since 1.3) its dependency downloads in the Coursier cache, and writes per-project build output to target directories.
