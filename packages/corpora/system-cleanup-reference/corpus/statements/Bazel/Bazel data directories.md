---
proposition:
  subject: '[Bazel](../../stores/Bazel.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: linux
      path: ~/.cache/bazel/_bazel_$USER
      holds: build-output
      rebuild: rebuild
    - platform: macos
      path: ~/Library/Caches/bazel/_bazel_$USER
      holds: build-output
      rebuild: rebuild
    - platform: macos
      path: /private/var/tmp/_bazel_$USER
      holds: build-output
      rebuild: rebuild
    - platform: windows
      path: '%USERPROFILE%\_bazel_$USER'
      holds: build-output
      rebuild: rebuild
    - platform: linux
      path: ~/.cache/bazel/_bazel_$USER/cache/repos/v1
      holds: downloads
      rebuild: re-download
    - platform: all
      path: <outputUserRoot>/cache/disk
      holds: cache
      rebuild: rebuild
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Bazel data directories 1](../../study-results/Bazel/2026-11-21%20Bazel%20data%20directories%201.md)'
  - '[2026-11-21 Bazel data directories 2](../../study-results/Bazel/2026-11-21%20Bazel%20data%20directories%202.md)'
  - '[2026-11-21 Bazel data directories 3](../../study-results/Bazel/2026-11-21%20Bazel%20data%20directories%203.md)'
  - '[2026-11-21 Bazel data directories 4](../../study-results/Bazel/2026-11-21%20Bazel%20data%20directories%204.md)'
  - '[2026-11-21 Bazel data directories 5](../../study-results/Bazel/2026-11-21%20Bazel%20data%20directories%205.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The output-directories page gives the outputRoot per platform (macOS changed in Bazel 9)
    and says the user's state is under outputRoot/_bazel_$USER; the build page gives the repository cache
    path and the caching page the default disk cache path.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Bazel](../../stores/Bazel.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The Windows outputRoot falls back through %HOME%, %USERPROFILE% and the profile folder; the path given
  assumes %HOME% is unset.
- The disk cache is off unless --disk_cache is passed; its location is whatever path the user gives.
- The <outputUserRoot>/cache/disk default is taken from the caching page text but only the sentence opening
  is quoted, because the path sits in inline code next to punctuation.
---

The output-directories page gives the outputRoot per platform (macOS changed in Bazel 9) and says the user's state is under outputRoot/_bazel_$USER; the build page gives the repository cache path and the caching page the default disk cache path.
