---
"@osdlc/pr-update": patch
---

The merge strategy now writes the merge commit message `Merge <base> into <head>` with a body line naming the base sha, instead of git's default title that named the temporary local branch (`Merge remote-tracking branch 'origin/main' into pr-update/scratch-...`).
