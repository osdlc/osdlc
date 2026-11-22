---
kind: docs
store: '[pacman](../../stores/pacman.md)'
observed: '2026-11-21'
locator: '"Failed to init transaction (unable to lock database)" error'
reportedIn:
- '[pacman - ArchWiki](../../documents/ArchWiki/pacman%20-%20ArchWiki.md)'
excerpt:
  exact: When pacman is about to alter the package database, for example installing a package, it creates
    a lock file at /var/lib/pacman/db.lck
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

pacman - ArchWiki (https://wiki.archlinux.org/title/Pacman) says, under "Failed to init transaction (unable to lock database)" error:

> When pacman is about to alter the package database, for example installing a package, it creates a lock file at /var/lib/pacman/db.lck
