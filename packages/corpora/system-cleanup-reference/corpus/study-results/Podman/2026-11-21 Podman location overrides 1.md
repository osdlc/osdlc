---
kind: source
store: '[Podman](../../stores/Podman.md)'
observed: '2026-11-21'
locator: 'ENVIRONMENT: CONTAINERS_STORAGE_CONF'
reportedIn:
- '[Podman podman(1)](../../documents/Podman/Podman%20podman%281%29.md)'
excerpt:
  exact: If the **CONTAINERS_STORAGE_CONF** environment variable is set, then its value is used for the
    storage.conf file rather than the default.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

Podman podman(1) (https://raw.githubusercontent.com/containers/podman/main/docs/source/markdown/podman.1.md) says, under ENVIRONMENT: CONTAINERS_STORAGE_CONF:

> If the **CONTAINERS_STORAGE_CONF** environment variable is set, then its value is used for the storage.conf file rather than the default.
