---
slug: pnpm
category: language-package-manager
vendor: pnpm
homepage: https://pnpm.io
docs: https://pnpm.io/motivation
repository: https://github.com/pnpm/pnpm
license: MIT
open_source: true
platforms:
- macos
- linux
- windows
cli: pnpm
checked: '2026-11-21'
sources:
- '[Store Settings](../documents/pnpm/Store%20Settings.md)'
- '[Other Settings](../documents/pnpm/Other%20Settings.md)'
- '[pnpm pnpm store](../documents/pnpm/pnpm%20pnpm%20store.md)'
- '[pnpm cache delete](../documents/pnpm/pnpm%20cache%20delete.md)'
- '[pnpm cache prune](../documents/pnpm/pnpm%20cache%20prune.md)'
- '[pnpm cache list](../documents/pnpm/pnpm%20cache%20list.md)'
- '[node_modules Settings](../documents/pnpm/node_modules%20Settings.md)'
---

pnpm is a Node.js package manager that keeps one content-addressable store per disk and hard-links packages from it into each project's node_modules. The store grows as versions accumulate, and a separate cache directory holds registry metadata and the dlx cache.

## Open

- in use: pnpm docs name no lock file or daemon marking the store as in use.
