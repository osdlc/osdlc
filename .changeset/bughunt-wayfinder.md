---
'@osdlc/wayfinder': minor
---

`way clean` no longer removes a store that holds the home directory under a directory whose name starts with `..` (such as `..x`). `way --cached --no-exec` now re-probes a runner whose stored rows were taken with exec allowed, instead of reporting it as fresh with no tasks.
Through `@osdlc/cli-tool` and `@osdlc/command-seam`, a working directory that cannot be entered now exits with the `repository` code instead of `missingTool`.
Behaviour change (stricter): a task handed the terminal (`way run`, the terminal UI, the web view's Run) whose program is a bare name now runs it only from an absolute `PATH` entry; a relative entry, which would find a file the repository ships, is skipped and the run fails as a missing binary. A path such as `./gradlew` runs as given. The web view's "handed off" message quotes the command line as the copy text does.
`~` expansion of the user config path and of tool module paths now uses `@osdlc/tiered-dirs`'s `expandTilde`; the result on each platform is unchanged.
