---
proposition:
  subject: '[nvm](../../stores/nvm.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: all
      path: ~/.nvm/versions/node
      holds: toolchains
      rebuild: re-download
    - platform: all
      path: ~/.nvm/.cache
      holds: cache
      rebuild: re-download
    - platform: all
      path: $XDG_CONFIG_HOME/nvm
      holds: toolchains
      rebuild: re-download
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 nvm data directories 1](../../study-results/nvm/2026-11-21%20nvm%20data%20directories%201.md)'
  - '[2026-11-21 nvm data directories 2](../../study-results/nvm/2026-11-21%20nvm%20data%20directories%202.md)'
  - '[2026-11-21 nvm data directories 3](../../study-results/nvm/2026-11-21%20nvm%20data%20directories%203.md)'
  - '[2026-11-21 nvm data directories 4](../../study-results/nvm/2026-11-21%20nvm%20data%20directories%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The README gives ~/.nvm (or $XDG_CONFIG_HOME/nvm) as the default NVM_DIR; nvm.sh defines
    the versions/node and .cache subdirectories.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[nvm](../../stores/nvm.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- nvm is for POSIX shells; native Windows (nvm-windows) is a different project and not covered.
---

The README gives ~/.nvm (or $XDG_CONFIG_HOME/nvm) as the default NVM_DIR; nvm.sh defines the versions/node and .cache subdirectories.
