---
slug: podman
category: container-runtime
vendor: Red Hat / Podman project (Containers organization)
homepage: https://podman.io
docs: https://docs.podman.io
repository: https://github.com/containers/podman
license: Apache-2.0
open_source: true
platforms:
- macos
- linux
- windows
cli: podman
checked: '2026-11-21'
sources:
- '[containers-storage.conf(5)](../documents/Containers%20project/containers-storage.conf%285%29.md)'
- '[Podman podman(1)](../documents/Podman/Podman%20podman%281%29.md)'
- '[podman-machine(1)](../documents/Podman/podman-machine%281%29.md)'
- '[podman-system-prune(1)](../documents/Podman/podman-system-prune%281%29.md)'
- '[podman-system-reset(1)](../documents/Podman/podman-system-reset%281%29.md)'
- '[podman-system-df(1)](../documents/Podman/podman-system-df%281%29.md)'
---

Podman is a daemonless, Docker-compatible container engine. On Linux it keeps images, containers and volumes in containers/storage (system-wide for root, under the user's home when rootless); on macOS and Windows it runs containers inside a Podman machine VM.

## Open

- in use: Which processes or lock files show that Podman storage is in use is not documented on the pages read.
