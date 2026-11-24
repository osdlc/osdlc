---
'@osdlc/code-stats': patch
---

`countTree` and the `count` command accept paths on Windows when the working directory is reached through an 8.3 short name such as `RUNNER~1`. The working directory and the repository root are both resolved to their canonical form before the paths are compared, so a path inside the repository is no longer reported as outside it.
