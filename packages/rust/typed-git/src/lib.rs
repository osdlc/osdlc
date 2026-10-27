//! Typed functions over the `git` command line.
//!
//! Each function takes a repository path, runs one or a few `git` commands
//! there, and returns a typed value or a [`GitError`]. The crate needs a
//! `git` binary on `PATH`; it does not link libgit2.
//!
//! - [`query`]: read-only facts, such as the HEAD sha, the branch, a parsed
//!   status with ahead and behind counts, and a file's bytes at a revision.
//! - [`commit`]: commits and reverts limited to named paths, and a push to
//!   the branch's upstream.
//! - [`clone`]: a cache checkout of another repository at a branch, tag or
//!   sha.
//! - [`worktree`]: create, health-check and remove linked worktrees.
//! - [`info`]: find the installed git and its version.
//! - [`cmd`]: the command builder every function above uses. Use it for a
//!   git call the typed functions do not cover.
//!
//! # Example
//!
//! ```
//! use typed_git::{git, query};
//!
//! # fn main() -> Result<(), Box<dyn std::error::Error>> {
//! let dir = tempfile::tempdir()?;
//! git().dir(dir.path()).args(&["init", "--quiet"]).run()?;
//! assert!(query::is_repo(dir.path())?);
//!
//! // Any git command the typed functions do not cover.
//! let stashes = git().dir(dir.path()).args(&["stash", "list"]).run()?;
//! assert!(stashes.is_empty());
//! # Ok(())
//! # }
//! ```
#![forbid(unsafe_code)]

pub mod clone;
pub mod cmd;
pub mod commit;
pub mod error;
pub mod info;
pub mod query;
pub mod worktree;

pub use cmd::{GitCommand, git};
pub use error::GitError;

// Runs the README's code blocks as doc-tests.
#[cfg(doctest)]
#[doc = include_str!("../README.md")]
struct ReadmeDoctests;
