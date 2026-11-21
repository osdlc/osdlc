---
proposition:
  subject: '[Composer](../../stores/Composer.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: macos
      path: ~/Library/Caches/composer
      holds: cache
      rebuild: re-download
    - platform: linux
      path: $XDG_CACHE_HOME/composer
      holds: cache
      rebuild: re-download
    - platform: linux
      path: ~/.composer/cache
      holds: cache
      rebuild: re-download
    - platform: windows
      path: '%LOCALAPPDATA%/Composer'
      holds: cache
      rebuild: re-download
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Composer data directories 1](../../study-results/Composer/2026-11-21%20Composer%20data%20directories%201.md)'
  - '[2026-11-21 Composer data directories 2](../../study-results/Composer/2026-11-21%20Composer%20data%20directories%202.md)'
  - '[2026-11-21 Composer data directories 3](../../study-results/Composer/2026-11-21%20Composer%20data%20directories%203.md)'
  - '[2026-11-21 Composer data directories 4](../../study-results/Composer/2026-11-21%20Composer%20data%20directories%204.md)'
  - '[2026-11-21 Composer data directories 5](../../study-results/Composer/2026-11-21%20Composer%20data%20directories%205.md)'
  - '[2026-11-21 Composer data directories 6](../../study-results/Composer/2026-11-21%20Composer%20data%20directories%206.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The config docs and Factory::getCacheDir give the cache location per platform; on Linux
    ~/.composer/cache is used when the home is ~/.composer and that cache already exists, otherwise the
    XDG path (~/.cache/composer when XDG_CACHE_HOME is unset).
- hasEvidenceItems:
  - '[2026-11-21 Composer data directories 7](../../study-results/Composer/2026-11-21%20Composer%20data%20directories%207.md)'
  directionOfEvidenceProvided: disputes
  strengthOfEvidenceProvided: moderate
  description: A source disagrees with the value.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Composer](../../stores/Composer.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The CLI docs say macOS uses $COMPOSER_HOME/cache while the config docs and source say ~/Library/Caches/composer;
  the source (current main) is taken as authoritative.
- Global packages installed with composer global live in a project under COMPOSER_HOME; no source read
  gives that vendor path explicitly.
---

The config docs and Factory::getCacheDir give the cache location per platform; on Linux ~/.composer/cache is used when the home is ~/.composer and that cache already exists, otherwise the XDG path (~/.cache/composer when XDG_CACHE_HOME is unset).
