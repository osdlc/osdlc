---
slug: bun
category: language-package-manager
vendor: Oven
homepage: https://bun.com
docs: https://bun.com/docs
repository: https://github.com/oven-sh/bun
license: MIT
open_source: true
platforms:
- macos
- linux
- windows
cli: bun
checked: '2026-11-21'
sources:
- '[Bun Global cache](../documents/Bun/Bun%20Global%20cache.md)'
- '[Bun bun pm](../documents/Bun/Bun%20bun%20pm.md)'
- '[Bun bun install](../documents/Bun/Bun%20bun%20install.md)'
---

Bun is a JavaScript runtime with a built-in npm-compatible package manager. It keeps every downloaded package version in a global cache (~/.bun/install/cache) and hard-links or clones them into each project's node_modules.

## Open

- in use: Bun docs name no lock file or daemon marking the cache in use.
