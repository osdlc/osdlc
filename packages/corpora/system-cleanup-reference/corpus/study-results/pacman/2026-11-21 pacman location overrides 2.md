---
kind: docs
store: '[pacman](../../stores/pacman.md)'
observed: '2026-11-21'
locator: OPTIONS > CleanMethod
version: 7.1.0
version_basis: exact
reportedIn:
- '[pacman.conf(5) — Arch manual pages](../../documents/Arch%20Linux/pacman.conf%285%29%20%E2%80%94%20Arch%20manual%20pages.md)'
excerpt:
  exact: If set to KeepInstalled (the default), the -Sc operation will clean packages that are no longer
    installed (not present in the local database).
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

pacman.conf(5) — Arch manual pages (https://man.archlinux.org/man/pacman.conf.5.en) says, under OPTIONS > CleanMethod:

> If set to KeepInstalled (the default), the -Sc operation will clean packages that are no longer installed (not present in the local database).
