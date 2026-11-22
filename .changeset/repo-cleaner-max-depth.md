---
"@osdlc/repo-cleaner": minor
---

Add `--max-depth <n>`, and `maxDepth` on `sweep` and `resolveEntries`: how many levels below a directory target a checkout may sit and still be found. The default stays 3, now exported as `DEFAULT_MAX_DEPTH`. A value that is not a whole number, 1 or more, is refused, and a search that stops at the limit says `--max-depth` looks deeper.
