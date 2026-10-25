# typed-git

Typed Rust functions over the `git` command line.

A program that drives git by hand ends up with the same code in many places:
build an argument list, spawn `git`, check the exit code, trim stdout, and
parse text such as `git status` output. Each copy gets a detail wrong, such
as a pathspec read as a glob, a ref read as an option or a push that waits for
a password. This crate does that work once. Each function takes a repository
path, runs git there and returns a typed value or a `GitError`.

- `query`: read-only facts. The HEAD sha, the branch, whether the tree is
  clean, a parsed `StatusReport` (branch, upstream, ahead and behind counts,
  and the state of each changed path), merge and rebase state, the paths a
  commit changed, a config value, and a file's bytes at a revision.
- `commit`: commits of named paths only (`commit_only`), which leave other
  staged work alone, a commit of everything, a revert that stays inside the
  reverted commit's paths, and a push to the branch's upstream that never
  prompts.
- `clone`: a cache checkout of another repository at a branch, tag or sha.
  `checkout` clones the first time and fetches after that.
- `worktree`: create, health-check and remove linked worktrees under a base
  directory you choose.
- `info`: whether git is installed, where, and which version.
- `cmd`: the command builder every function uses, `git()`, for any git call
  the typed functions do not cover.

It is for tools that already depend on the `git` binary and want a small,
typed layer over it.

## Install

```sh
cargo add typed-git
```

The crate is imported as `typed_git`. It needs a `git` binary on `PATH` at
run time.

## Quick start

```rust
use std::fs;
use std::path::Path;
use typed_git::query::FileState;
use typed_git::{commit, git, query, worktree};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let dir = tempfile::tempdir()?;
    let repo = dir.path();
    git().dir(repo).args(&["init", "--quiet"]).run()?;
    git().dir(repo).args(&["config", "user.name", "Ex"]).run()?;
    git().dir(repo).args(&["config", "user.email", "ex@example.com"]).run()?;

    // Commit one file and leave another untracked.
    fs::write(repo.join("a.md"), "a\n")?;
    fs::write(repo.join("b.md"), "b\n")?;
    let paths = vec!["a.md".to_string()];
    commit::add_intent(repo, &paths)?;
    let sha = commit::commit_only(repo, &paths, "Add a", None)?;
    assert_eq!(query::head_sha(repo)?, sha);

    // One `git status` call, parsed.
    let report = query::status_report(repo)?;
    assert_eq!(report.entries.len(), 1);
    assert_eq!(report.entries[0].path, "b.md");
    assert_eq!(report.entries[0].state, FileState::Untracked);

    // A linked worktree on a new branch, under `<repo>/.worktrees`.
    let wt = worktree::create(repo, Path::new(".worktrees"), "job-1", "job-1")?;
    assert_eq!(query::current_branch(&wt)?, "job-1");
    worktree::remove(repo, &wt)?;

    // Any other git command.
    let log = git().dir(repo).args(&["log", "--format=%s"]).run()?;
    assert_eq!(log, "Add a");
    Ok(())
}
```

`examples/status.rs` prints the status of a repository:
`cargo run --example status -- <path>`.

## Behaviour to know

- Every function runs the `git` binary. Nothing is cached between calls.
- `GitCommand::run` returns stdout with surrounding whitespace trimmed.
  `run_raw` returns the full `std::process::Output`. `check` turns the exit
  code into a `bool`.
- A git command that exits non-zero is `GitError::Command`, with the command
  line and git's stderr. A refusal the crate makes before git runs, such as a
  commit with no paths, has the same shape.
- `commit` passes every path with `GIT_LITERAL_PATHSPECS=1`, so `*.md` means
  the file named `*.md`.
- `commit_only` fails on an untracked path. Call `add_intent` on it first.
- `push_upstream` sets `GIT_TERMINAL_PROMPT=0`, so a push that needs
  credentials fails instead of waiting.
- `clone` refuses a URL or reference that begins with `-`, so it cannot be
  read as an option. A shallow `--branch` clone is tried first. When the
  reference is a commit sha, the crate falls back to a full clone and a
  checkout.
- `clone::refresh` hard-resets the checkout onto the fetched commit. It is
  meant for a cache, not a checkout with local work.
- `worktree::create` reads a relative base directory from the repository
  root. When the worktree path already exists, it is returned as it is.
- `query::current_branch` returns the text `HEAD` when HEAD is detached.
  `StatusReport::branch` is `None` then.
- `StatusReport::ahead` and `behind` are `None` when the branch has no
  upstream, which is not the same as zero.
- The commands inherit the process environment. A `GIT_DIR` or
  `GIT_WORK_TREE` set by a git hook makes them act on that repository.

## Platforms

Linux, macOS and Windows. The crate has no platform-specific code. It runs
`git` through `std::process::Command` and finds it on `PATH` with `which`. CI
runs the tests on all three.

Minimum supported Rust version: 1.89, the MSRV of the workspace this crate is
built in.

## When not to use it

- You cannot rely on a `git` binary being installed. Use `gix` or `git2`.
- You need many git calls per second. Each function spawns a process.
- You need an object-level API (trees, blobs, packfiles). This crate wraps
  porcelain commands.
- You need async. The functions block until git exits.

## Compared with other crates

| | `typed-git` | `git2` | `gix` | `std::process::Command` |
|---|---|---|---|---|
| Needs a `git` binary | yes | no | no | yes |
| Native or C dependency | no | libgit2 | no | no |
| Same behaviour as the user's git, config and hooks | yes | no | partly | yes |
| Typed results | yes, for the functions it has | yes | yes | no |
| Path-limited commit and revert in one call | yes | build it | build it | build it |
| Surface | small | large | large | none |

This comparison is from each crate's documentation. Pick `git2` or `gix` when
you need a library git. Pick this crate when you already run the `git` binary
and want its behaviour with typed results.

## Stability

The crate is on 0.x. A breaking change ships only in a new 0.x minor release,
with a CHANGELOG entry.

- `GitError`, `FileState`, `RepoState`, `StatusEntry`, `StatusReport`,
  `Checkout`, `GitInfo` and `Version` are `#[non_exhaustive]`. A later
  release can add a variant or a field without a breaking change. A `match`
  on an enum needs a `_` arm, and the structs cannot be built outside the
  crate.
- The functions in `query`, `commit`, `clone`, `worktree` and `info`, and
  `git()` and `GitCommand`, are the public API.

## Version numbers and the TypeScript package

The TypeScript package `@osdlc/typed-git` covers the same ground with a larger
API. One version number means the same functional level in both, with
differences in idiom per language. This crate starts at 0.4.0 and is behind
the TypeScript package. A later release closes the gap and takes the
TypeScript version number.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT License](LICENSE-MIT), at your option.
