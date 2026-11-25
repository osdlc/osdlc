---
"@osdlc/config-layers": minor
---

Re-export `TieredDirsError` from `@osdlc/tiered-dirs` on the `@osdlc/config-layers/dirs` subpath, so a caller of `systemDirs` can match its errors with `instanceof`.
