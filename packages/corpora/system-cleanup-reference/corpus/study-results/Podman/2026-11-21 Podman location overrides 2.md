---
kind: source
store: '[Podman](../../stores/Podman.md)'
observed: '2026-11-21'
locator: 'STORAGE TABLE: imagestore'
reportedIn:
- '[containers-storage.conf(5)](../../documents/Containers%20project/containers-storage.conf%285%29.md)'
excerpt:
  exact: If `imagestore` is provided, newly pulled images will be stored in the `imagestore` location.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

containers-storage.conf(5) (https://raw.githubusercontent.com/containers/container-libs/main/storage/docs/containers-storage.conf.5.md) says, under STORAGE TABLE: imagestore:

> If `imagestore` is provided, newly pulled images will be stored in the `imagestore` location.
