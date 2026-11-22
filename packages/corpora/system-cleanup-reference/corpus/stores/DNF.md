---
slug: dnf
category: os-package-manager
vendor: Red Hat / Fedora Project
homepage: https://github.com/rpm-software-management/dnf5
docs: https://dnf5.readthedocs.io/en/latest/
repository: https://github.com/rpm-software-management/dnf5
license: GPL-2.0-or-later
open_source: true
platforms:
- linux
cli: dnf
system: true
checked: '2026-11-21'
sources:
- '[DNF5 Configuration Reference — dnf5 documentation](../documents/dnf5/DNF5%20Configuration%20Reference%20%E2%80%94%20dnf5%20documentation.md)'
- '[Clean Command — dnf5 documentation](../documents/dnf5/Clean%20Command%20%E2%80%94%20dnf5%20documentation.md)'
- '[Autoremove Command — dnf5 documentation](../documents/dnf5/Autoremove%20Command%20%E2%80%94%20dnf5%20documentation.md)'
- '[DNF Command Reference — dnf latest documentation](../documents/DNF/DNF%20Command%20Reference%20%E2%80%94%20dnf%20latest%20documentation.md)'
---

DNF is the RPM package manager of Fedora, RHEL and related distributions; Fedora ships DNF5 as dnf, while RHEL still uses DNF 4. It caches repository metadata and, when keepcache is on, downloaded packages; leaf dependencies stay installed until autoremove. The system cache is under /var/cache and cleaning it needs root.

## Open

- inventory command: Neither the DNF5 nor the DNF 4 pages read document a command that reports cache size.
- in use: The DNF5 lock file location and process names (dnf, dnf5, packagekitd) are not documented in the pages read.
