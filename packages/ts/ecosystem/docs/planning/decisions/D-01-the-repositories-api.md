---
id: D-01
type: decision
state: proposed
created: 2026-11-23
---

# D-01: The first `./repositories` API

## Decision

- **A locator object, and a one-shot function.** `new CheckoutLocator(opts)`
  resolves the roots when it is made and scans them on the first `locate`,
  keeping one index for every later call. `locateCheckout(target, opts)`
  makes one for a single target. D-ZVIA asks for one index per call site;
  pr-update resolves every target of a run, twice, through one locator.
- **The roots are there before the scan.** `roots`, `source` and `file` are
  properties of the locator, so a caller can name what it searched, and where
  to set it, in a "not found" message without a second read of the file.
- **`owner/name` carries no host.** It matches a checkout on any host.
  `host/owner/name` and a typed-git `RepoCoordinate` with a `host` match that
  host only. A nested GitLab group has more segments than the string form
  reads, so it is passed as a `RepoCoordinate`.
- **`OSDLC_REPOSITORIES` is read from `process.env`.** config-layers'
  `machineConfigFile` reads its variable there and takes no environment. The
  package reads the same place to refuse a relative value, so the check and
  the file always agree. The `env` and `home` options steer the directories
  and `~`, which is what a test needs; a test clears the variable.
- **`~user/…` is not expanded.** It would need the account database. It is
  dropped with a warning like any relative root, and `writeRoots` refuses it.
- **An invalid `roots` value gives the default roots,** with a warning that
  names the file, as config-layers drops an invalid section. A missing file,
  a file without `roots`, and a broken `roots` all scan the defaults; only
  `roots: []` scans nothing.
- **A checkout git cannot read, or one with no `origin` that names a
  repository, is not in the index.** The walk finds a `.git` entry; git then
  has to agree. The scan works on the real path of each directory it finds,
  sets `GIT_CEILING_DIRECTORIES` to its parent, and keeps it only when
  `git rev-parse --is-inside-work-tree --show-cdup` prints `true` and an
  empty cdup. The ceiling alone is not enough: git splits it on the path
  delimiter with no escaping, so a parent such as `~/a:b` defeats it. The
  check compares no paths, since Node's `realpathSync` keeps the case it was
  given and git reports the case on disk, and git trims nothing that matters
  (a name ending in a space). `--show-cdup` alone would pass a directory
  whose `.git` is a bare repository.
- **Inherited repository variables are unset** for every git call the
  package makes, in the caller's checkout and in the scan: `GIT_DIR`,
  `GIT_WORK_TREE`, `GIT_COMMON_DIR`, `GIT_INDEX_FILE`,
  `GIT_OBJECT_DIRECTORY`, `GIT_ALTERNATE_OBJECT_DIRECTORIES` and the
  inherited `GIT_CEILING_DIRECTORIES`. A git hook exports `GIT_DIR` (a
  receive hook as `.`), and with it the caller's checkout and every found
  directory would answer as the hook's repository, or as none. The default
  roots set no ceiling, since the caller may be a subdirectory of its
  checkout. The runner
  is wrapped to pass them as `undefined`, which command-seam drops from the
  child's environment; typed-git is unchanged.
- **A bare store with worktrees beside it is not supported yet.** In that
  layout `proj/.git` is a file pointing at `proj/.bare`, so the walk stops at
  `proj`, which is not a working tree, and never sees the worktrees inside.
- **`depthLimited` is on the locator,** summed over the roots, so a caller
  can say why nothing was found. It is known only after a scan, so reading it
  scans.
- **`writeRoots` edits the `roots` entry only** (config-layers' `setPath`),
  so no other key is read and written back through a second YAML parser.
  Comments inside the old entry go, as `setPath` places them.
- **`WriteConflictError` is re-exported,** so a caller catches it without
  depending on `@osdlc/etag-write` itself.
- **The owner is read only when it can matter.** When the directory above
  the holder is the home directory or above it, there is no step up to
  decide, and no `origin` is read.

## Why

- pr-update is the first caller (its D-0005): it resolves many targets in one
  run, prints where it looked, and checks every match for unpushed work.
- Every export stays 0.x until a second tool, sdlc, reads the file.
