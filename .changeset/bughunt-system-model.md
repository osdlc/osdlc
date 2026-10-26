---
'@osdlc/system-model': minor
---

The make runner reads one makefile per directory in GNU make's order (`GNUmakefile`, then `makefile`, then `Makefile`), so a directory holding several now reports a different file's targets. It also lists every target on a multi-target line (`build test:`). A go-task include outside the root is no longer attributed to the root `Taskfile.yml`. A just parameter whose default is an expression is optional and puts no literal in the argv. A crate a workspace excludes gets its own cargo aliases, including when an inner workspace excludes it but an outer one lists it. A workspace root whose TOML does not parse still covers its crates.
A Gemfile `platforms … do` or `if` block no longer closes the `group` around it. yaml-lite reads an escaped backslash before a closing quote correctly. deno and turbo configs accept a BOM and trailing commas, and an unparseable deno config is a warning diagnostic.
A cache entry with no usable report is a miss. `humanMs` and `humanAge` pick the unit from the rounded value (`1.0s`, not `1000ms`). The pinned install `command` is shell-quoted, and its default probe runs a bare name only from an absolute PATH entry. `validateToolDef` checks each `ecosystem.manifests`, `languages` and `tools` entry.
Repository reads check that a path's real location stays inside the repository with `@osdlc/path-guard`'s `realPathInside`, a new dependency, in place of a hand-written prefix check. On Windows the comparison now follows `node:path`'s rules, so a real path that differs from the root only in letter case counts as inside it.
