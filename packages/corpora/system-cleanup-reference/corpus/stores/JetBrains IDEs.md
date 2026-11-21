---
slug: jetbrains-ides
category: editor
vendor: JetBrains
homepage: https://www.jetbrains.com
docs: https://www.jetbrains.com/help/idea/
repository: https://github.com/JetBrains/intellij-community
open_source: false
platforms:
- macos
- linux
- windows
checked: '2026-11-21'
sources:
- '[Directories used by the IDE IntelliJ IDEA Documentation](../documents/JetBrains/Directories%20used%20by%20the%20IDE%20IntelliJ%20IDEA%20Documentation.md)'
- '[Invalidate caches IntelliJ IDEA Documentation](../documents/JetBrains/Invalidate%20caches%20IntelliJ%20IDEA%20Documentation.md)'
---

JetBrains IDEs (IntelliJ IDEA, PyCharm, WebStorm, GoLand and others built on the IntelliJ Platform) keep a separate set of directories per product and major version. The system directory fills with indexes, caches and local history, and the logs directory with logs and thread dumps; old versions' directories pile up after upgrades. The platform core is open source (Apache-2.0) but most IDEs are commercial.

## Open

- inventory command: No inventory command is documented; the Delete Leftover IDE Directories dialog lists old versions but its contents are not described.
- in use: Which process names or lock files show a JetBrains IDE is using its system directory is not documented on the pages read.
