---
proposition:
  subject: '[Homebrew](../../stores/Homebrew.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: macos
      path: ~/Library/Caches/Homebrew
      holds: downloads
      rebuild: re-download
    - platform: linux
      path: ~/.cache/Homebrew
      holds: downloads
      rebuild: re-download
    - platform: macos
      path: ~/Library/Logs/Homebrew
      holds: logs
      rebuild: lost
    - platform: linux
      path: ~/.cache/Homebrew/Logs
      holds: logs
      rebuild: lost
    - platform: macos
      path: /opt/homebrew
      holds: packages
      rebuild: re-download
    - platform: linux
      path: /home/linuxbrew/.linuxbrew
      holds: packages
      rebuild: re-download
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Homebrew data directories 1](../../study-results/Homebrew/2026-11-21%20Homebrew%20data%20directories%201.md)'
  - '[2026-11-21 Homebrew data directories 2](../../study-results/Homebrew/2026-11-21%20Homebrew%20data%20directories%202.md)'
  - '[2026-11-21 Homebrew data directories 3](../../study-results/Homebrew/2026-11-21%20Homebrew%20data%20directories%203.md)'
  - '[2026-11-21 Homebrew data directories 4](../../study-results/Homebrew/2026-11-21%20Homebrew%20data%20directories%204.md)'
  - '[2026-11-21 Homebrew data directories 5](../../study-results/Homebrew/2026-11-21%20Homebrew%20data%20directories%205.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: 'The manpage gives the cache and log defaults per platform (Linux: $XDG_CACHE_HOME/Homebrew
    or ~/.cache/Homebrew); the install page gives the prefix whose Cellar holds old formula versions that
    cleanup removes.'
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Homebrew](../../stores/Homebrew.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The default prefix on Intel Macs (/usr/local) is not stated in the quoted install page sentence.
- The sub-path of old formula versions inside the prefix (Cellar) is not quoted from a source.
---

The manpage gives the cache and log defaults per platform (Linux: $XDG_CACHE_HOME/Homebrew or ~/.cache/Homebrew); the install page gives the prefix whose Cellar holds old formula versions that cleanup removes.
