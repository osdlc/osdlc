---
'@osdlc/system-model': patch
---

Two fixes for running detection inside a repository that is not yet trusted.

- File discovery now runs git with `core.fsmonitor` off. `git ls-files --others` runs the command `core.fsmonitor` names, and discovery runs before a repository is trusted, so a `.git/config` that came with a directory (an archive, a shared folder) could run a command on any `detect`, `collect` or cache read.
- The default `makeRunner` and `which` now find a binary on absolute `PATH` entries only. Every spawn runs in the repository, where a relative `PATH` entry (`bin`, `.`, `node_modules/.bin`) or, on Windows, the current folder would find a `git` the repository ships. Such a binary is no longer found or run. A tool found only through a relative `PATH` entry, such as a runner in a project-local `node_modules/.bin` put on `PATH` as `node_modules/.bin`, now reads as not installed; put an absolute entry on `PATH`, or pass your own `makeRunner` and `which`.
