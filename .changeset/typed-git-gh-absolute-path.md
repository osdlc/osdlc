---
'@osdlc/typed-git': patch
'@osdlc/typed-gh': patch
---

The default runners now find `git` and `gh` on absolute `PATH` entries only, and spawn the absolute path found. Before, a bare `git` or `gh` was spawned by name with the child's `cwd` set to the checkout, so a file of that name in the checkout could run in place of the real binary: on Windows, where a bare name is searched in `cwd` first, and on every platform through a relative or empty `PATH` entry. A binary that is not found on an absolute entry fails as a missing binary (`not-installed`). typed-gh's `defaultRunnerFactory` does the same lookup. An injected runner is unchanged.
