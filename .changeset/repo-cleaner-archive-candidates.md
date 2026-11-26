---
"@osdlc/repo-cleaner": minor
---

`archiveCandidates` pushes one archive of a repository's candidates, and `removeCandidate` takes its answer as `archived` in place of pushing an archive per candidate. A worktree that changes after an archive that had nothing to hold is no longer removed. `mayContribute` no longer counts a worktree whose directory is gone, so `run --archive` does not refuse one for a repository with no remote.
