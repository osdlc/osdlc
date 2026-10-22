---
"@osdlc/command-seam": minor
---

New `isCommandFailed(error)` recognises a `CommandFailed` by its shape, so it still matches one thrown by another installed copy of the package, where `instanceof` is false. `mapFailed`, `catchFailed` and their async twins use it.
