---
proposition:
  subject: '[Coursier](../../stores/Coursier.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: linux
      path: ~/.cache/coursier/v1
      holds: packages
      rebuild: re-download
    - platform: macos
      path: ~/Library/Caches/Coursier/v1
      holds: packages
      rebuild: re-download
    - platform: windows
      path: '%LOCALAPPDATA%\Coursier\Cache\v1'
      holds: packages
      rebuild: re-download
    - platform: linux
      path: ~/.cache/coursier/jvm
      holds: toolchains
      rebuild: re-download
    - platform: macos
      path: ~/Library/Caches/Coursier/jvm
      holds: toolchains
      rebuild: re-download
    - platform: windows
      path: '%LOCALAPPDATA%\Coursier\Cache\jvm'
      holds: toolchains
      rebuild: re-download
    - platform: all
      path: ~/.coursier/cache/v1
      holds: packages
      rebuild: re-download
    - platform: linux
      path: ~/.local/share/coursier/bin
      holds: packages
      rebuild: re-download
    - platform: macos
      path: ~/Library/Application Support/Coursier/bin
      holds: packages
      rebuild: re-download
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Coursier data directories 1](../../study-results/Coursier/2026-11-21%20Coursier%20data%20directories%201.md)'
  - '[2026-11-21 Coursier data directories 2](../../study-results/Coursier/2026-11-21%20Coursier%20data%20directories%202.md)'
  - '[2026-11-21 Coursier data directories 3](../../study-results/Coursier/2026-11-21%20Coursier%20data%20directories%203.md)'
  - '[2026-11-21 Coursier data directories 4](../../study-results/Coursier/2026-11-21%20Coursier%20data%20directories%204.md)'
  - '[2026-11-21 Coursier data directories 5](../../study-results/Coursier/2026-11-21%20Coursier%20data%20directories%205.md)'
  - '[2026-11-21 Coursier data directories 6](../../study-results/Coursier/2026-11-21%20Coursier%20data%20directories%206.md)'
  - '[2026-11-21 Coursier data directories 7](../../study-results/Coursier/2026-11-21%20Coursier%20data%20directories%207.md)'
  - '[2026-11-21 Coursier data directories 8](../../study-results/Coursier/2026-11-21%20Coursier%20data%20directories%208.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The Coursier cache and java docs list the artifact cache and managed-JVM directories per
    platform, the legacy ~/.coursier path, and the app install directory; a maintainer reply says the
    cache is refilled after deletion.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Coursier](../../stores/Coursier.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The Windows app install directory is blank in the docs.
- Deleting the install directory removes installed launchers, which cs install must recreate.
---

The Coursier cache and java docs list the artifact cache and managed-JVM directories per platform, the legacy ~/.coursier path, and the app install directory; a maintainer reply says the cache is refilled after deletion.
