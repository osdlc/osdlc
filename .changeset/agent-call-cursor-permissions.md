---
"@osdlc/agent-call": minor
---

cursor: `permissions.allowTools` and `permissions.denyTools` now take effect. The adapter maps tool names (`Read`, `Edit`, `Bash(git:*)`, `mcp__server__tool`, cursor-form rules) to cursor permission rules and writes them to `.cursor/cli.json` in the working directory for the length of the call, then restores the original file. A second cursor call in the same directory is refused while one runs; a stale lock from a killed run is recovered. `PlannedCall.projectFiles` shows the planned file edit. Unmappable names are dropped with a note.
