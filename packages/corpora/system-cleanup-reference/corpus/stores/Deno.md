---
slug: deno
category: language-package-manager
vendor: Deno Land Inc.
homepage: https://deno.com
docs: https://docs.deno.com
repository: https://github.com/denoland/deno
license: MIT
open_source: true
platforms:
- macos
- linux
- windows
cli: deno
checked: '2026-11-21'
sources:
- '[Deno Packages](../documents/Deno/Deno%20Packages.md)'
- '[libs cache_dir deno_dir.rs](../documents/Deno/libs%20cache_dir%20deno_dir.rs.md)'
- '[Environment variables 2](../documents/Deno/Environment%20variables%202.md)'
- '[Deno deno clean](../documents/Deno/Deno%20deno%20clean.md)'
- '[Deno deno info](../documents/Deno/Deno%20deno%20info.md)'
- '[Configuration (deno.json)](../documents/Deno/Configuration%20%28deno.json%29.md)'
---

Deno is a JavaScript and TypeScript runtime with built-in dependency management. It caches remote modules, npm packages and compiled TypeScript in a global cache directory (DENO_DIR) shared by all projects, and can also write node_modules or vendor directories into a project.

## Open

- in use: Deno docs name no lock file or daemon marking DENO_DIR in use.
