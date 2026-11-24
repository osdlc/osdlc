---
"@osdlc/host-cleaner": minor
---

While Orca is installed but not running, or `orca status` fails or prints no JSON, the `orca` plugin refuses every worktree under its workspaces folder instead of leaving them to `git`.
