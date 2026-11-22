---
kind: source
store: '[Podman](../../stores/Podman.md)'
observed: '2026-11-21'
locator: DESCRIPTION
reportedIn:
- '[podman-system-prune(1)](../../documents/Podman/podman-system-prune%281%29.md)'
excerpt:
  exact: By default, volumes are not removed to prevent important data from being deleted if there is
    currently no container using the volume.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

podman-system-prune(1) (https://raw.githubusercontent.com/containers/podman/main/docs/source/markdown/podman-system-prune.1.md) says, under DESCRIPTION:

> By default, volumes are not removed to prevent important data from being deleted if there is currently no container using the volume.
