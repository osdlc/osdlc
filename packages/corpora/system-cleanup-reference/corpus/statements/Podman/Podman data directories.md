---
proposition:
  subject: '[Podman](../../stores/Podman.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: linux
      path: /var/lib/containers/storage
      holds: state
      rebuild: lost
    - platform: linux
      path: ~/.local/share/containers/storage
      holds: state
      rebuild: lost
    - platform: linux
      path: $XDG_DATA_HOME/containers/storage
      holds: state
      rebuild: lost
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Podman data directories 1](../../study-results/Podman/2026-11-21%20Podman%20data%20directories%201.md)'
  - '[2026-11-21 Podman data directories 2](../../study-results/Podman/2026-11-21%20Podman%20data%20directories%202.md)'
  - '[2026-11-21 Podman data directories 3](../../study-results/Podman/2026-11-21%20Podman%20data%20directories%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: containers-storage.conf(5) and podman(1) give the root and rootless graphroot defaults;
    the store holds images and also volumes (marked lost because volumes are user data).
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Podman](../../stores/Podman.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform:
  - linux
status: current
open:
- Where a Podman machine keeps its VM disk image on macOS and Windows is not given by the pages read.
- Whether volumes sit inside graphroot by default is not stated on the pages read; the whole store is
  marked lost conservatively.
---

containers-storage.conf(5) and podman(1) give the root and rootless graphroot defaults; the store holds images and also volumes (marked lost because volumes are user data).
