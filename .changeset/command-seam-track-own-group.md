---
"@osdlc/command-seam": minor
---

Export the group registry's start/settle calls so a caller that spawns its own detached child can register it for signal forwarding: `spawnTrackedGroup`, `settleGroup`, `releaseWhenEmpty` and `groupStartRefusal`, all `@experimental`. Behaviour is unchanged. The runners already use them.
