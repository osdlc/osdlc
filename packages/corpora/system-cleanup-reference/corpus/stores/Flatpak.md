---
slug: flatpak
category: os-package-manager
vendor: Flatpak
homepage: https://flatpak.org
docs: https://docs.flatpak.org
repository: https://github.com/flatpak/flatpak
license: LGPL-2.1-or-later
open_source: true
platforms:
- linux
cli: flatpak
system: true
checked: '2026-11-21'
sources:
- '[Flatpak Command Reference — Flatpak documentation](../documents/Flatpak/Flatpak%20Command%20Reference%20%E2%80%94%20Flatpak%20documentation.md)'
---

Flatpak installs sandboxed Linux desktop apps and the runtimes they need, in a system-wide installation under /var/lib/flatpak and a per-user one under ~/.local/share/flatpak. Runtimes and extensions stay installed after the apps that used them are removed, and app data in ~/.var/app outlives uninstalls. Cleaning the system installation needs root (or polkit authorization).
