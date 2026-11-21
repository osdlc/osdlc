---
kind: source
store: '[Podman](../../stores/Podman.md)'
observed: '2026-11-21'
locator: 'STORAGE TABLE: graphroot'
reportedIn:
- '[containers-storage.conf(5)](../../documents/Containers%20project/containers-storage.conf%285%29.md)'
excerpt:
  exact: 'container storage graph dir (default: `/var/lib/containers/storage` or as rootless `$XDG_DATA_HOME/containers/storage`/`$HOME/.local/share/containers/storage`
    depending on if `$XDG_DATA_HOME` is set)'
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

containers-storage.conf(5) (https://raw.githubusercontent.com/containers/container-libs/main/storage/docs/containers-storage.conf.5.md) says, under STORAGE TABLE: graphroot:

> container storage graph dir (default: `/var/lib/containers/storage` or as rootless `$XDG_DATA_HOME/containers/storage`/`$HOME/.local/share/containers/storage` depending on if `$XDG_DATA_HOME` is set)
