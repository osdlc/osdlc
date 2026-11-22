---
proposition:
  subject: '[Zed](../../stores/Zed.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: linux
      path: ~/.local/share/zed/languages
      holds: toolchains
      rebuild: re-download
    - platform: linux
      path: ~/.local/share/zed/extensions
      holds: packages
      rebuild: re-download
    - platform: linux
      path: ~/.local/share/zed/debug_adapters
      holds: toolchains
      rebuild: re-download
    - platform: linux
      path: ~/.local/share/zed/external_agents
      holds: toolchains
      rebuild: re-download
    - platform: linux
      path: ~/.local/share/zed/remote_servers
      holds: downloads
      rebuild: re-download
    - platform: linux
      path: ~/.local/share/zed/logs
      holds: logs
      rebuild: lost
    - platform: linux
      path: ~/.cache/zed
      holds: cache
      rebuild: rebuild
    - platform: macos
      path: ~/Library/Application Support/Zed/languages
      holds: toolchains
      rebuild: re-download
    - platform: macos
      path: ~/Library/Application Support/Zed/extensions
      holds: packages
      rebuild: re-download
    - platform: macos
      path: ~/Library/Logs/Zed
      holds: logs
      rebuild: lost
    - platform: macos
      path: ~/Library/Caches/Zed
      holds: cache
      rebuild: rebuild
    - platform: windows
      path: '%LOCALAPPDATA%\Zed\languages'
      holds: toolchains
      rebuild: re-download
    - platform: windows
      path: '%LOCALAPPDATA%\Zed\extensions'
      holds: packages
      rebuild: re-download
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Zed data directories 1](../../study-results/Zed/2026-11-21%20Zed%20data%20directories%201.md)'
  - '[2026-11-21 Zed data directories 2](../../study-results/Zed/2026-11-21%20Zed%20data%20directories%202.md)'
  - '[2026-11-21 Zed data directories 3](../../study-results/Zed/2026-11-21%20Zed%20data%20directories%203.md)'
  - '[2026-11-21 Zed data directories 4](../../study-results/Zed/2026-11-21%20Zed%20data%20directories%204.md)'
  - '[2026-11-21 Zed data directories 5](../../study-results/Zed/2026-11-21%20Zed%20data%20directories%205.md)'
  - '[2026-11-21 Zed data directories 6](../../study-results/Zed/2026-11-21%20Zed%20data%20directories%206.md)'
  - '[2026-11-21 Zed data directories 7](../../study-results/Zed/2026-11-21%20Zed%20data%20directories%207.md)'
  - '[2026-11-21 Zed data directories 8](../../study-results/Zed/2026-11-21%20Zed%20data%20directories%208.md)'
  - '[2026-11-21 Zed data directories 9](../../study-results/Zed/2026-11-21%20Zed%20data%20directories%209.md)'
  - '[2026-11-21 Zed data directories 10](../../study-results/Zed/2026-11-21%20Zed%20data%20directories%2010.md)'
  - '[2026-11-21 Zed data directories 11](../../study-results/Zed/2026-11-21%20Zed%20data%20directories%2011.md)'
  - '[2026-11-21 Zed data directories 12](../../study-results/Zed/2026-11-21%20Zed%20data%20directories%2012.md)'
  - '[2026-11-21 Zed data directories 13](../../study-results/Zed/2026-11-21%20Zed%20data%20directories%2013.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: Zed's paths.rs defines each subdirectory of the data dir and its purpose; the CLI help
    text gives the data dir per platform; the uninstall doc lists the macOS cache and log folders.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Zed](../../stores/Zed.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- What Zed keeps in its cache directory (temp_dir) and whether deleting it is safe while Zed is closed
  is not documented.
- Windows log and cache locations are not quoted here (paths.rs puts logs under the data dir and the cache
  under the platform cache dir).
---

Zed's paths.rs defines each subdirectory of the data dir and its purpose; the CLI help text gives the data dir per platform; the uninstall doc lists the macOS cache and log folders.
