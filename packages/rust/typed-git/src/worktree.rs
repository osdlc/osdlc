//! Create, health-check and remove linked worktrees.
//!
//! A linked worktree is a second working directory over a repository you
//! already have. It shares the repository's objects and refs, and has its
//! own HEAD, index and checked-out branch.
//!
//! ```
//! use std::path::Path;
//! use typed_git::{git, query, worktree};
//!
//! # fn main() -> Result<(), Box<dyn std::error::Error>> {
//! let dir = tempfile::tempdir()?;
//! let repo = dir.path();
//! git().dir(repo).args(&["init", "--quiet"]).run()?;
//! git()
//!     .dir(repo)
//!     .args(&["-c", "user.name=Ex", "-c", "user.email=ex@example.com"])
//!     .args(&["commit", "--quiet", "--allow-empty", "-m", "first"])
//!     .run()?;
//!
//! // A relative base directory is read from the repository root.
//! let wt = worktree::create(repo, Path::new(".worktrees"), "job-1", "job-1")?;
//! assert_eq!(wt, repo.join(".worktrees").join("job-1"));
//! assert_eq!(query::current_branch(&wt)?, "job-1");
//! assert!(worktree::is_healthy(&wt)?);
//!
//! worktree::remove(repo, &wt)?;
//! assert!(!wt.exists());
//! # Ok(())
//! # }
//! ```

use std::fs;
use std::path::{Path, PathBuf};

use crate::{GitError, git};

/// Create a worktree at `{base}/{id}` on `branch`, and return its path.
///
/// A relative `base` is read from `repo`, so `Path::new(".worktrees")` puts
/// the worktree at `{repo}/.worktrees/{id}`. An absolute `base` is used as
/// it is. The base directory is created when missing.
///
/// `branch` is created from HEAD. When it already exists, it is checked out
/// in the new worktree instead. When `{base}/{id}` already exists on disk,
/// it is returned as it is, without checking what it holds; use
/// [`is_healthy`] for that.
pub fn create(repo: &Path, base: &Path, branch: &str, id: &str) -> Result<PathBuf, GitError> {
    let dir = repo.join(base);
    fs::create_dir_all(&dir).map_err(GitError::Exec)?;

    let path = dir.join(id);

    if path.exists() {
        log::info!("Worktree already exists at {}", path.display());
        return Ok(path);
    }

    // Try creating with a new branch (-b)
    let mut cmd = git();
    cmd.dir(repo)
        .args(&["worktree", "add", "-b", branch])
        .arg(path.to_string_lossy().as_ref());
    let result = cmd.run();

    match result {
        Ok(_) => {}
        Err(GitError::Command { ref stderr, .. }) if stderr.contains("already exists") => {
            // Branch exists — retry without -b to check out existing branch
            let mut cmd = git();
            cmd.dir(repo)
                .args(&["worktree", "add"])
                .arg(path.to_string_lossy().as_ref())
                .arg(branch);
            cmd.run()?;
        }
        Err(e) => return Err(e),
    }

    log::info!(
        "Created worktree '{}' at {} (branch: {})",
        id,
        path.display(),
        branch
    );
    Ok(path)
}

/// True when `path` exists, is inside a git work tree and has a HEAD that
/// names a commit.
///
/// `false` means the worktree is missing or broken and should be
/// recreated.
pub fn is_healthy(path: &Path) -> Result<bool, GitError> {
    if !path.exists() {
        return Ok(false);
    }

    let mut cmd = git();
    cmd.dir(path).args(&["rev-parse", "--is-inside-work-tree"]);
    let is_wt = cmd.check()?;
    if !is_wt {
        return Ok(false);
    }

    let mut cmd = git();
    cmd.dir(path).args(&["rev-parse", "--verify", "HEAD"]);
    cmd.check()
}

/// Remove a worktree with `git worktree remove --force`, which discards its
/// uncommitted changes. Does nothing when the path does not exist.
///
/// `repo` is the repository the worktree belongs to, where the command runs.
/// The branch is kept.
pub fn remove(repo: &Path, worktree_path: &Path) -> Result<(), GitError> {
    if !worktree_path.exists() {
        return Ok(());
    }

    let mut cmd = git();
    cmd.dir(repo)
        .args(&["worktree", "remove", "--force"])
        .arg(worktree_path.to_string_lossy().as_ref());
    cmd.run()?;

    log::info!("Cleaned up worktree at {}", worktree_path.display());
    Ok(())
}
