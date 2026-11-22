# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `cmd`: `GitCommand::env_remove` removes a variable from the git
  subprocess's environment.

### Fixed

- `diff`: `diff_text` passes `--inter-hunk-context=0` and removes
  `GIT_DIFF_OPTS` from git's environment, so `diff.interHunkContext` and a
  `-u<n>` in `GIT_DIFF_OPTS` no longer change the lines of context, and
  `context(0)` gives the changed lines alone. The docs list every setting that
  still changes the text, and say that `find_renames()` also overrides
  `diff.renames=copies`.

## [0.4.2](https://github.com/osdlc/osdlc/compare/typed-git/v0.4.1...typed-git/v0.4.2) - 2026-11-21

### Other

- a context option and opt-in rename detection on the diff verbs ([#917](https://github.com/osdlc/osdlc/pull/917))

### Added

- `diff`: `DiffTextOptions::context` (`--unified=<n>`, default 3) and
  `DiffTextOptions::find_renames` (`-M`, off by default, so `diff.renames`
  still applies).
- `object`: `cat_file_batch` and `cat_file_batch_chunks` read many objects
  byte for byte through `git cat-file --batch`, with a size cap
  (`CatFileBatchOptions::max_bytes`) and groups of about `chunk_bytes`.

## [0.4.1](https://github.com/osdlc/osdlc/compare/typed-git/v0.4.0...typed-git/v0.4.1) - 2026-11-17

### Added

- *(typed-git)* diff_name_status, diff_text and merge_base ([#855](https://github.com/osdlc/osdlc/pull/855))

### Added

- `diff`: `diff_name_status` (changed paths with their status, and the old
  path of a rename or copy, for a range, the index or the working tree),
  `diff_text` (the unified diff, optionally staged, with `--binary`, limited
  to paths) and `merge_base` (`None` for unrelated histories), with the
  `Change`, `ChangeKind`, `DiffNameStatusOptions` and `DiffTextOptions`
  types. `diff_text` always passes `--no-color`, `--no-ext-diff`,
  `--no-textconv`, `--src-prefix=a/`, `--dst-prefix=b/`, `--no-relative`,
  `--submodule=short` and `--unified=3`, so the text is a plain unified diff
  with three lines of context under the user's colour, external diff,
  textconv, prefix, `diff.relative`, `diff.submodule` and `diff.context`
  settings. `diff.renames`, `diff.ignoreSubmodules`, `diff.algorithm` and the
  `GIT_DIFF_OPTS` environment variable still apply. `diff_name_status` passes
  `--no-relative`, and `--no-color` as a guard. Both pass `--` after the
  revision, so git never reads it as a path, and both read their paths as git
  pathspecs, so `*.md` is a glob. `merge_base` runs git with `LC_ALL=C`,
  because it reads git's `error:` and `fatal:` words.

## [0.4.0] - 2026-10-27

The first public release. `typed-git` is a typed Rust layer over the `git`
command line. It reads repository facts, makes commits and reverts limited to
named paths, pushes to the tracked branch, clones and refreshes a cache
checkout, manages linked worktrees, and has a command builder for anything the
typed functions do not cover.

The crate merges two earlier crates, `easy-git` (the typed functions) and
`fluent-git` (the command builder). Neither was published.

One version number means the same functional level in this crate and in the
TypeScript `@osdlc/typed-git`. The TypeScript package is at 0.5.0, so this
crate is behind. A later release closes the gap and takes the TypeScript
version number.

### Added

- `query`: `head_sha`, `current_branch`, `is_repo`, `has_valid_head`,
  `is_clean`, `branch_exists`, `diff_stat`, `log_oneline`, `status_short`,
  `repo_state`, `git_path`, `commit_paths`, `config_value`, `commit_subject`,
  `resolve_commit`, `file_at`, `short_sha`, and `status_report` and
  `status_report_of`, which return a parsed `StatusReport`.
- `commit`: `commit_only` (named paths only), `add_intent`, `commit_all`,
  `revert_only`, `upstream_of_head` and `push_upstream`.
- `clone`: `clone`, `refresh` and `checkout`, which returns a `Checkout`.
- `worktree`: `create`, `is_healthy` and `remove`.
- `info`: `available`, `path` and `get`, with the `GitInfo` and `Version`
  types.
- `cmd`: `git()` and `GitCommand`, with `dir`, `arg`, `args`, `env`, `envs`,
  `stdin`, `run`, `run_raw` and `check`. `git`, `GitCommand` and `GitError`
  are also at the crate root.
- `GitError`, the one error type, with the variants `NotAvailable`, `Exec`
  and `Command`.
- Doc-tests on every module and an `examples/status.rs` program.

### Changed (from the earlier crates)

- `worktree::create` takes the base directory as a parameter:
  `create(repo, base, branch, id)`. A relative base is read from the
  repository root. The earlier crate used a fixed folder.
- `GitError`, `FileState`, `RepoState`, `StatusEntry`, `StatusReport`,
  `Checkout`, `GitInfo` and `Version` are `#[non_exhaustive]`.
- `clone`, `refresh` and `checkout` refuse a URL or reference that begins
  with `-`, and `clone` passes the URL after `--`.
- `Version` moved from `fluent-git`'s builder module to `info`.

### Removed (from the earlier crates)

- The chained worktree builder of `fluent-git` (`builder::repo`, `Repo`, the
  worktree `Add` and `Remove` builders) and `builder::version`. The
  `worktree` functions and `info::get` cover the same ground.
- `GitError::NotARepo`, which nothing returned.

## History before the first public release

These versions were never published. They are rebuilt from the git history of
the two earlier crates.

### [0.1.9] - 2026-10-10 (unpublished)

#### Added

- `GitCommand::stdin`, written on another thread so a large input cannot
  deadlock the child.

### [0.1.8] - 2026-10-07 (unpublished)

#### Added

- `status_report_of` (status limited to given paths) and `file_at` (a file's
  bytes at a revision).

### [0.1.7] - 2026-10-04 (unpublished)

#### Added

- `add_intent` (intent-to-add for paths).

### [0.1.6] - 2026-09-30 (unpublished)

#### Added

- `commit_all` and `config_value`.

### [0.1.5] - 2026-09-30 (unpublished)

#### Added

- The `commit` module: `commit_only`, `revert_only`, `upstream_of_head` and
  `push_upstream`.
- `repo_state`, `git_path`, `commit_paths`, `commit_subject`, `resolve_commit`
  and `short_sha`.

### [0.1.4] - 2026-09-28 (unpublished)

#### Added

- `status_report` returning a `StatusReport` of `StatusEntry` and `FileState`.

### [0.1.3] - 2026-09-10 (unpublished)

#### Added

- The `clone` module: `clone`, `refresh`, `checkout` and the `Checkout` type.

### [0.1.2] - 2026-08-26 (unpublished)

#### Fixed

- Parsing `git --version` no longer panics on unexpected output.

### [0.1.1] - 2026-08-08 (unpublished)

#### Added

- Typed queries and worktree functions: the `query` and `worktree` modules,
  with `git`, `GitCommand` and `GitError` re-exported at the crate root.

### [0.1.0] - 2026-08-07 (unpublished)

#### Added

- The command builder (`git()`, `GitCommand`), `GitError`, the `info` module
  (`path`, `available`, `get`) and a chained builder for worktrees.
