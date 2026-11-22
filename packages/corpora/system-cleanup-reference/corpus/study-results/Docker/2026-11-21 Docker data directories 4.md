---
kind: docs
store: '[Docker](../../stores/Docker.md)'
observed: '2026-11-21'
locator: Daemon data directory
reportedIn:
- '[Docker daemon configuration overview Docker Docs](../../documents/Docker/Docker%20daemon%20configuration%20overview%20Docker%20Docs.md)'
excerpt:
  exact: When using the containerd image store (the default for Docker Engine 29.0 and later on fresh
    installations), image contents and container snapshots are stored in /var/lib/containerd
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

Docker daemon configuration overview Docker Docs (https://docs.docker.com/engine/daemon/) says, under Daemon data directory:

> When using the containerd image store (the default for Docker Engine 29.0 and later on fresh installations), image contents and container snapshots are stored in /var/lib/containerd
