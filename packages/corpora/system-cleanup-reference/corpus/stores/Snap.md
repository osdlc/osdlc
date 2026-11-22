---
slug: snap
category: os-package-manager
vendor: Canonical
homepage: https://snapcraft.io
docs: https://snapcraft.io/docs
repository: https://github.com/canonical/snapd
license: GPL-3.0-only
open_source: true
platforms:
- linux
cli: snap
system: true
checked: '2026-11-21'
sources:
- '[Data locations - Snap documentation](../documents/Canonical/Data%20locations%20-%20Snap%20documentation.md)'
- '[Revisions - Snap documentation](../documents/Canonical/Revisions%20-%20Snap%20documentation.md)'
- '[Create data snapshots - Snap documentation](../documents/Canonical/Create%20data%20snapshots%20-%20Snap%20documentation.md)'
- '[Manage updates - Snap documentation](../documents/Canonical/Manage%20updates%20-%20Snap%20documentation.md)'
- '[Get started - Snap documentation](../documents/Canonical/Get%20started%20-%20Snap%20documentation.md)'
- '[Disk space awareness - Snap documentation](../documents/Canonical/Disk%20space%20awareness%20-%20Snap%20documentation.md)'
---

Snap is Canonical's package system, run by the snapd daemon, that installs apps as SquashFS .snap files. snapd keeps older revisions of each snap (2 on classic systems, 3 on Ubuntu Core, set by refresh.retain) plus per-revision data, and automatic snapshots of removed snaps for 31 days. Everything lives under /var/lib/snapd and /var/snap, so cleaning needs root.
