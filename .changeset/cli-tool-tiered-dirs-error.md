---
"@osdlc/cli-tool": minor
---

Re-export `TieredDirsError` and `homeDir` next to `systemDirs`, so a tool can match the errors of its directory resolution with `instanceof` and expand `~` against the home its directories are built on.
