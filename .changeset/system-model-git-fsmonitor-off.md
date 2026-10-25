---
'@osdlc/system-model': patch
---

File discovery now runs git with `core.fsmonitor` off. `git ls-files --others` runs the command `core.fsmonitor` names, and discovery runs before a repository is trusted, so a `.git/config` that came with a directory (an archive, a shared folder) could run a command on any `detect`, `collect` or cache read. Nothing to change on your side.
