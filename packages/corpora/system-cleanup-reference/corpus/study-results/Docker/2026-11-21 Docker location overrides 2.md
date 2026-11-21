---
kind: docs
store: '[Docker](../../stores/Docker.md)'
observed: '2026-11-21'
locator: Configure the data directory location
reportedIn:
- '[Docker daemon configuration overview Docker Docs](../../documents/Docker/Docker%20daemon%20configuration%20overview%20Docker%20Docs.md)'
excerpt:
  exact: The data-root option does not affect image and container data stored in /var/lib/containerd when
    using the containerd image store.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

Docker daemon configuration overview Docker Docs (https://docs.docker.com/engine/daemon/) says, under Configure the data directory location:

> The data-root option does not affect image and container data stored in /var/lib/containerd when using the containerd image store.
