---
proposition:
  subject: '[Docker](../../stores/Docker.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: linux
      path: /var/lib/docker
      holds: state
      rebuild: lost
    - platform: linux
      path: /var/lib/containerd
      holds: images
      rebuild: re-download
    - platform: linux
      path: ~/.local/share/docker
      holds: state
      rebuild: lost
    - platform: windows
      path: C:\ProgramData\docker
      holds: state
      rebuild: lost
    - platform: macos
      path: ~/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw
      holds: images
      rebuild: lost
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Docker data directories 1](../../study-results/Docker/2026-11-21%20Docker%20data%20directories%201.md)'
  - '[2026-11-21 Docker data directories 2](../../study-results/Docker/2026-11-21%20Docker%20data%20directories%202.md)'
  - '[2026-11-21 Docker data directories 3](../../study-results/Docker/2026-11-21%20Docker%20data%20directories%203.md)'
  - '[2026-11-21 Docker data directories 4](../../study-results/Docker/2026-11-21%20Docker%20data%20directories%204.md)'
  - '[2026-11-21 Docker data directories 5](../../study-results/Docker/2026-11-21%20Docker%20data%20directories%205.md)'
  - '[2026-11-21 Docker data directories 6](../../study-results/Docker/2026-11-21%20Docker%20data%20directories%206.md)'
  - '[2026-11-21 Docker data directories 7](../../study-results/Docker/2026-11-21%20Docker%20data%20directories%207.md)'
  - '[2026-11-21 Docker data directories 8](../../study-results/Docker/2026-11-21%20Docker%20data%20directories%208.md)'
  - '[2026-11-21 Docker data directories 9](../../study-results/Docker/2026-11-21%20Docker%20data%20directories%209.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Docker's daemon docs give /var/lib/docker (Linux) and C:\ProgramData\docker (Windows) as
    the single data directory holding containers, images and volumes (marked lost because volumes live
    there), /var/lib/containerd for image content under the containerd image store, ~/.local/share/docker
    for rootless mode, and the Mac FAQ shows Docker Desktop's Docker.raw disk image (marked lost because
    it is the VM's whole Docker store).
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Docker](../../stores/Docker.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The default path of Docker Desktop's disk image on Windows (WSL 2 or Hyper-V backends) and on Linux
  is not given by the pages read; the docs say to read it from Settings > Resources > Advanced.
- Whether the Docker.raw disk image also holds volumes is not stated outright on the Mac FAQ; it is marked
  lost conservatively.
---

Docker's daemon docs give /var/lib/docker (Linux) and C:\ProgramData\docker (Windows) as the single data directory holding containers, images and volumes (marked lost because volumes live there), /var/lib/containerd for image content under the containerd image store, ~/.local/share/docker for rootless mode, and the Mac FAQ shows Docker Desktop's Docker.raw disk image (marked lost because it is the VM's whole Docker store).
