# @osdlc/diffkit

## History before the first public release

These versions were never published. They are rebuilt from the git history.

### [0.2.7] - 2026-11-22 (unpublished)

`diffkit prep` and `runPrep` read a pull request, a branch or the working tree and print one deterministic JSON manifest for a reviewer: the files worth reading, the files to set aside and why, review groups by package root, and reading-order flags. File facts come from `@osdlc/code-stats`.

#### Added

- `--base <ref>` with `--worktree` diffs the merge base of `<ref>` and `HEAD` against the working tree, so a branch's commits and its uncommitted edits read as one change.

#### Changed

- Breaking: the manifest is `schema: 2`. It reads its file facts from a `@osdlc/code-stats` change report and classifies nothing itself.
  - `change` is the change as code-stats resolves it: `kind` is `pr`, `range`, `merge-base` (was `branch`) or `worktree`, with `label`, `pr` and the `base` and `head` commits (were `baseRev` and `headRev`, and `pr: {number}`).
  - `files.kept[].group` and `category` are code-stats' file groups and change categories, and each kept file has a `language`.
  - `files.dropped[].reason` is `generated`, `vendored` or `formatting-only`. A lockfile is `generated` (was `lockfile`). Generated and vendored files are what code-stats finds, including the repository's `linguist-generated` and `linguist-vendored` attributes, no longer a list of fixed paths.
  - The flags judge test files by code-stats' `tests` group, read JavaScript sources (`.js`, `.jsx`, `.mjs`, `.cjs`) as well as TypeScript, skip build output and fixtures under `dist/`, `fixtures/` or `vendored/`, and read no declaration file.
  - A pull request whose commits are not in the checkout is an error that says to run `gh pr checkout`.

#### Removed

- Breaking: the `stats` subcommand and the library API only it used (`runStats`, `buildReport`, `renderReport`, `spliceBody`, the report schema, the line classifier, the API delta and complexity analyzers, the diff parser and the change resolvers). Use `@osdlc/code-stats` for change statistics.
- Breaking: `PrepError` and `DEFAULT_GROUP_SIZE`. `runPrep` raises `DiffkitError`, and the default group size is `DEFAULT_THRESHOLDS.groupSize`.

### [0.2.6] - 2026-10-31 (unpublished)

#### Fixed

- Corrections to diff parsing, change categories, API extraction, complexity and the PR-body splice, each with a regression test.

### [0.2.5] - 2026-10-30 (unpublished)

#### Fixed

- Wrong results in diff parsing, API extraction, categorization and complexity.

### [0.2.4] - 2026-10-27 (unpublished)

#### Added

- `diffkit dev link`, `diffkit dev status`, `diffkit dev off` and the `DIFFKIT_HOME` variable run the installed `diffkit` from a development checkout.

### [0.2.3] - 2026-10-26 (unpublished)

#### Added

- `diffkit --version`.

### [0.2.2] - 2026-10-26 (unpublished)

#### Fixed

- Failures from the git and GitHub clients are read by their shape, so a failed command shows its first line instead of a stack.

### [0.2.1] - 2026-10-20 (unpublished)

#### Fixed

- Updated for the GitHub client's new return shape.

### [0.2.0] - 2026-10-20 (unpublished)

#### Added

- `diffkit prep [<pr>|--base <ref> [--head <ref>]|--worktree] [--group-size <n>]`: one JSON manifest (`prepManifestSchema`, `schema: 1`) with `files.kept` and `files.dropped`, `groups` of kept files by nearest package root, and two TypeScript reading-order flags, `long-function` and `test-only-export`. Library: `runPrep`, `buildGroups`, `packageRoots`, `nearestRoot`, `splitEven`.

#### Changed

- Breaking: the tool is renamed to `diffkit`. Its single binary takes the `stats` and `prep` subcommands, and the PR-body markers are renamed.

### [0.1.1] - 2026-10-17 (unpublished)

#### Fixed

- Updated for the renamed git client.

### [0.1.0] - 2026-10-09 (unpublished)

#### Added

- Line statistics by code, comments, blank and prose and by file group, change categories per file, dependency-manifest changes, the public API delta for TypeScript and Rust, and a complexity movers table.
- A command-line tool and the `runStats`, `buildReport`, `renderReport` and `spliceBody` library functions.
