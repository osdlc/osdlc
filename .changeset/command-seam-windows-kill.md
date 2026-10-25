---
'@osdlc/command-seam': patch
---

On Windows, `kill()` on a `managedProcessRunner` handle started with `processGroup: true` now stops the child. Windows has no process groups, so the group signal failed and nothing was stopped: the child kept running and `exited` never settled. It now signals the direct child, as the async runner already did. On POSIX nothing changes.
