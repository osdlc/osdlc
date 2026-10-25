---
'@osdlc/command-seam': patch
---

With `absolutePathOnly`, an unset `PATH` on POSIX now searches `/usr/bin:/bin`, as a spawn of a bare name does and as `which` without `absolutePathOnly` already did. Before, it found nothing, so a process started with an empty environment could not run `git` through an `absolutePathOnly` runner. Windows still searches nothing. `absolutePathCandidates` with `path: undefined` returns those two candidates on POSIX.
