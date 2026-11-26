---
"@osdlc/config-layers": minor
---

Re-export `TieredDirsError` and `homeDir` from `@osdlc/tiered-dirs` on the package root and the `@osdlc/config-layers/dirs` subpath, so a caller of `systemDirs` can match its errors with `instanceof` and expand `~` against the home its directories are built on.
