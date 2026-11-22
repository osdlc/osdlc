---
slug: npm
category: language-package-manager
vendor: GitHub (npm, Inc.)
homepage: https://www.npmjs.com
docs: https://docs.npmjs.com
repository: https://github.com/npm/cli
license: Artistic-2.0
open_source: true
platforms:
- macos
- linux
- windows
cli: npm
checked: '2026-11-21'
sources:
- '[npm Folders](../documents/npm/npm%20Folders.md)'
- '[npm npm-cache](../documents/npm/npm%20npm-cache.md)'
- '[workspaces config lib definitions definitions.js](../documents/npm/workspaces%20config%20lib%20definitions%20definitions.js.md)'
- '[npm Logging](../documents/npm/npm%20Logging.md)'
- '[npm config](../documents/npm/npm%20config.md)'
---

npm is the package manager bundled with Node.js. It keeps a content-addressable cache of every fetched package and HTTP response (_cacache), packages fetched by npx (_npx) and debug logs (_logs) under its cache folder, and installs project dependencies into node_modules.

## Open

- in use: npm docs name no lock file or daemon that marks the cache as in use; npm runs only as short-lived npm/npx processes.
