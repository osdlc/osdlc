---
slug: apt
category: os-package-manager
vendor: Debian
homepage: https://wiki.debian.org/Apt
docs: https://manpages.debian.org/trixie/apt/apt-get.8.en.html
repository: https://salsa.debian.org/apt-team/apt
license: GPL-2.0-or-later
open_source: true
platforms:
- linux
cli: apt-get
system: true
checked: '2026-11-21'
sources:
- '[apt-get(8) — apt — Debian trixie — Debian Manpages](../documents/Debian/apt-get%288%29%20%E2%80%94%20apt%20%E2%80%94%20Debian%20trixie%20%E2%80%94%20Debian%20Manpages.md)'
- '[apt.conf(5) — apt — Debian trixie — Debian Manpages](../documents/Debian/apt.conf%285%29%20%E2%80%94%20apt%20%E2%80%94%20Debian%20trixie%20%E2%80%94%20Debian%20Manpages.md)'
- '[apt-cache(8) — apt — Debian trixie — Debian Manpages](../documents/Debian/apt-cache%288%29%20%E2%80%94%20apt%20%E2%80%94%20Debian%20trixie%20%E2%80%94%20Debian%20Manpages.md)'
---

APT is the package manager of Debian, Ubuntu and their derivatives. It keeps downloaded .deb files in /var/cache/apt/archives and package lists in /var/lib/apt/lists, and leaves automatically installed dependencies behind after their dependents are removed. It is system-wide: all of its data is under /var and cleaning needs root.
