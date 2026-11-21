---
proposition:
  subject: '[Poetry](../../stores/Poetry.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: linux
      path: ~/.cache/pypoetry
      holds: cache
      rebuild: re-download
    - platform: macos
      path: ~/Library/Caches/pypoetry
      holds: cache
      rebuild: re-download
    - platform: windows
      path: C:\Users\<username>\AppData\Local\pypoetry\Cache
      holds: cache
      rebuild: re-download
    - platform: all
      path: '{cache-dir}/virtualenvs'
      holds: packages
      rebuild: re-download
    - platform: linux
      path: ~/.local/share/pypoetry/python
      holds: toolchains
      rebuild: re-download
    - platform: macos
      path: ~/Library/Application Support/pypoetry/python
      holds: toolchains
      rebuild: re-download
    - platform: windows
      path: '%APPDATA%\pypoetry\python'
      holds: toolchains
      rebuild: re-download
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Poetry data directories 1](../../study-results/Poetry/2026-11-21%20Poetry%20data%20directories%201.md)'
  - '[2026-11-21 Poetry data directories 2](../../study-results/Poetry/2026-11-21%20Poetry%20data%20directories%202.md)'
  - '[2026-11-21 Poetry data directories 3](../../study-results/Poetry/2026-11-21%20Poetry%20data%20directories%203.md)'
  - '[2026-11-21 Poetry data directories 4](../../study-results/Poetry/2026-11-21%20Poetry%20data%20directories%204.md)'
  - '[2026-11-21 Poetry data directories 5](../../study-results/Poetry/2026-11-21%20Poetry%20data%20directories%205.md)'
  - '[2026-11-21 Poetry data directories 6](../../study-results/Poetry/2026-11-21%20Poetry%20data%20directories%206.md)'
  - '[2026-11-21 Poetry data directories 7](../../study-results/Poetry/2026-11-21%20Poetry%20data%20directories%207.md)'
  - '[2026-11-21 Poetry data directories 8](../../study-results/Poetry/2026-11-21%20Poetry%20data%20directories%208.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The configuration doc gives cache-dir and data-dir defaults per platform, virtualenvs.path
    defaulting to {cache-dir}/virtualenvs, and python.installation-dir defaulting to {data-dir}/python.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Poetry](../../stores/Poetry.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The Windows cache path is quoted from the docs as written (with a <username> placeholder) but its line
  cannot be quoted reliably because the placeholder looks like an HTML tag.
- Deleting a project's virtualenv under {cache-dir}/virtualenvs loses nothing permanent but requires poetry
  install to rebuild it.
---

The configuration doc gives cache-dir and data-dir defaults per platform, virtualenvs.path defaulting to {cache-dir}/virtualenvs, and python.installation-dir defaulting to {data-dir}/python.
