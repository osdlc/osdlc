---
slug: pacman
category: os-package-manager
vendor: Arch Linux
homepage: https://pacman.archlinux.page
docs: https://man.archlinux.org/man/pacman.8.en
repository: https://gitlab.archlinux.org/pacman/pacman
license: GPL-2.0-or-later
open_source: true
platforms:
- linux
cli: pacman
system: true
checked: '2026-11-21'
sources:
- '[pacman(8) — Arch manual pages](../documents/Arch%20Linux/pacman%288%29%20%E2%80%94%20Arch%20manual%20pages.md)'
- '[pacman - ArchWiki](../documents/ArchWiki/pacman%20-%20ArchWiki.md)'
- '[pacman.conf(5) — Arch manual pages](../documents/Arch%20Linux/pacman.conf%285%29%20%E2%80%94%20Arch%20manual%20pages.md)'
- '[paccache(8) — Arch manual pages](../documents/Arch%20Linux/paccache%288%29%20%E2%80%94%20Arch%20manual%20pages.md)'
---

pacman is the package manager of Arch Linux and its derivatives. It keeps every downloaded package in /var/cache/pacman/pkg and never removes old or uninstalled versions on its own; paccache from pacman-contrib trims the cache to the last few versions. The cache is system-wide and cleaning it needs root.
