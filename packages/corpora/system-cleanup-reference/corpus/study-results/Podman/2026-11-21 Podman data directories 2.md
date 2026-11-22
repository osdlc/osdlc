---
kind: source
store: '[Podman](../../stores/Podman.md)'
observed: '2026-11-21'
locator: --root
reportedIn:
- '[Podman podman(1)](../../documents/Podman/Podman%20podman%281%29.md)'
excerpt:
  exact: 'Storage root dir in which data, including images, is stored (default: "/var/lib/containers/storage"
    for UID 0, "$HOME/.local/share/containers/storage" for other users).'
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

Podman podman(1) (https://raw.githubusercontent.com/containers/podman/main/docs/source/markdown/podman.1.md) says, under --root:

> Storage root dir in which data, including images, is stored (default: "/var/lib/containers/storage" for UID 0, "$HOME/.local/share/containers/storage" for other users).
