---
proposition:
  subject: '[Jan](../../stores/Jan.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: macos
      path: ~/Library/Application Support/Jan/data/llamacpp/models
      holds: models
      rebuild: re-download
    - platform: macos
      path: ~/Library/Application Support/Jan/data/mlx/models
      holds: models
      rebuild: re-download
    - platform: linux
      path: ~/.local/share/Jan/data/llamacpp/models
      holds: models
      rebuild: re-download
    - platform: windows
      path: '%APPDATA%\Jan\data\llamacpp\models'
      holds: models
      rebuild: re-download
    - platform: macos
      path: ~/Library/Application Support/Jan/data/threads
      holds: state
      rebuild: lost
    - platform: linux
      path: ~/.local/share/Jan/data/threads
      holds: state
      rebuild: lost
    - platform: windows
      path: '%APPDATA%\Jan\data\threads'
      holds: state
      rebuild: lost
    - platform: macos
      path: ~/Library/Application Support/Jan/data/logs
      holds: logs
      rebuild: rebuild
    - platform: linux
      path: ~/.local/share/Jan/data/logs
      holds: logs
      rebuild: rebuild
    - platform: windows
      path: '%APPDATA%\Jan\data\logs'
      holds: logs
      rebuild: rebuild
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Jan data directories 1](../../study-results/Jan/2026-11-21%20Jan%20data%20directories%201.md)'
  - '[2026-11-21 Jan data directories 2](../../study-results/Jan/2026-11-21%20Jan%20data%20directories%202.md)'
  - '[2026-11-21 Jan data directories 3](../../study-results/Jan/2026-11-21%20Jan%20data%20directories%203.md)'
  - '[2026-11-21 Jan data directories 4](../../study-results/Jan/2026-11-21%20Jan%20data%20directories%204.md)'
  - '[2026-11-21 Jan data directories 5](../../study-results/Jan/2026-11-21%20Jan%20data%20directories%205.md)'
  - '[2026-11-21 Jan data directories 6](../../study-results/Jan/2026-11-21%20Jan%20data%20directories%206.md)'
  - '[2026-11-21 Jan data directories 7](../../study-results/Jan/2026-11-21%20Jan%20data%20directories%207.md)'
  - '[2026-11-21 Jan data directories 8](../../study-results/Jan/2026-11-21%20Jan%20data%20directories%208.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The data-folder page gives the per-platform data folder and its llamacpp/models, mlx/models,
    threads and logs subfolders; models imported from local files are linked in place, not copied, so
    the files under models/ are Jan's own downloads.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Jan](../../stores/Jan.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The agent-workspace folder (memories, skills, sandboxes) is user state that would be lost; its size
  is not documented.
- The MLX models folder is described for the data folder generally; Apple Silicon is the only platform
  that uses it.
---

The data-folder page gives the per-platform data folder and its llamacpp/models, mlx/models, threads and logs subfolders; models imported from local files are linked in place, not copied, so the files under models/ are Jan's own downloads.
