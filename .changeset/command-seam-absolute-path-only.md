---
'@osdlc/command-seam': minor
---

New `absolutePathOnly` option, for a command run inside a folder you do not trust. `spawnRunner(binary, { absolutePathOnly: true })` and `spawnRunnerAsync(binary, { absolutePathOnly: true })` look a bare name up on absolute `PATH` entries only and spawn the absolute path found. A relative or empty `PATH` entry is looked up from the child's `cwd`, and a Windows spawn of a bare name searches `cwd` first, so without the option a file named `git` in a cloned repository can run in place of git. When nothing is found the run fails as a missing binary does (`ENOENT`, kind `not-installed`). A name with a separator, such as `./gradlew`, still runs as given.

`which(binary, { absolutePathOnly: true })` does the same lookup without running anything, reading `PATHEXT` on Windows. `absolutePathCandidates(binary, { path, pathext, platform })` returns the paths that lookup checks, in order, without reading the disk. New types: `SpawnRunnerOptions`, `PathCandidateOptions`. Existing calls are unchanged.
