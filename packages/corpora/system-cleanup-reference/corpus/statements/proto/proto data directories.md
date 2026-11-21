---
proposition:
  subject: '[proto](../../stores/proto.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: all
      path: ~/.proto/tools
      holds: toolchains
      rebuild: re-download
    - platform: all
      path: ~/.proto/temp
      holds: downloads
      rebuild: re-download
    - platform: all
      path: ~/.proto/cache
      holds: cache
      rebuild: re-download
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 proto data directories 1](../../study-results/proto/2026-11-21%20proto%20data%20directories%201.md)'
  - '[2026-11-21 proto data directories 2](../../study-results/proto/2026-11-21%20proto%20data%20directories%202.md)'
  - '[2026-11-21 proto data directories 3](../../study-results/proto/2026-11-21%20proto%20data%20directories%203.md)'
  - '[2026-11-21 proto data directories 4](../../study-results/proto/2026-11-21%20proto%20data%20directories%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: 'The proto overview and FAQ give the ~/.proto layout: downloads go to temp, tools unpack
    into tools/<name>/<version>, and HTTP requests are cached in cache/requests.'
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[proto](../../stores/proto.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The docs give the tools/ path only with a <name>/<version> placeholder in the same sentence, and do
  not give a separate plugins directory path or Windows-specific paths for tools/, temp/ and cache/ (the
  config page implies %USERPROFILE%\.proto as the home on Windows).
---

The proto overview and FAQ give the ~/.proto layout: downloads go to temp, tools unpack into tools/<name>/<version>, and HTTP requests are cached in cache/requests.
