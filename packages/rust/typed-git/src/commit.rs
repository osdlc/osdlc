//! Commits that name their paths, a commit of everything, reverts that stay
//! inside a commit's own paths, and a push to the branch's upstream.
//!
//! Every path is passed with `GIT_LITERAL_PATHSPECS=1`, so a file named
//! `*.md` or `:(top)` means that file and nothing else.
//!
//! ```
//! use std::fs;
//! use typed_git::{commit, git, query};
//!
//! # fn main() -> Result<(), Box<dyn std::error::Error>> {
//! let dir = tempfile::tempdir()?;
//! let repo = dir.path();
//! git().dir(repo).args(&["init", "--quiet"]).run()?;
//! git().dir(repo).args(&["config", "user.name", "Ex"]).run()?;
//! git().dir(repo).args(&["config", "user.email", "ex@example.com"]).run()?;
//! fs::write(repo.join("a.md"), "a\n")?;
//! fs::write(repo.join("b.md"), "b\n")?;
//!
//! // Commit a.md only. An untracked path needs `add_intent` first.
//! let paths = vec!["a.md".to_string()];
//! commit::add_intent(repo, &paths)?;
//! let sha = commit::commit_only(repo, &paths, "Add a", None)?;
//!
//! assert_eq!(query::commit_paths(repo, &sha)?, ["a.md"]);
//! assert_eq!(query::commit_subject(repo, &sha)?, "Add a");
//! assert!(!query::is_clean(repo)?); // b.md is still untracked
//! # Ok(())
//! # }
//! ```

use std::path::Path;

use crate::{GitError, git, query};

/// A `git` command in `repo` that reads every path literally.
fn literal(repo: &Path) -> crate::GitCommand {
    let mut cmd = git();
    cmd.dir(repo).env("GIT_LITERAL_PATHSPECS", "1");
    cmd
}

/// A refusal made before git runs, in [`GitError::Command`]'s shape.
fn refused(command: &str, reason: &str) -> GitError {
    GitError::Command {
        command: command.to_string(),
        stderr: reason.to_string(),
    }
}

/// Commit the working-tree state of `paths` and nothing else
/// (`git commit --only`). Other staged changes stay staged and out of the
/// commit. `author` is `Name <email>`; `None` commits as the configured
/// identity. Returns the new commit's full sha.
///
/// Every path must be known to git (tracked, or deleted since the last
/// commit); an untracked path fails the whole commit.
pub fn commit_only(
    repo: &Path,
    paths: &[String],
    message: &str,
    author: Option<&str>,
) -> Result<String, GitError> {
    if paths.is_empty() {
        return Err(refused("commit", "no paths to commit"));
    }
    let mut cmd = literal(repo);
    cmd.args(&["commit", "--only", "--quiet", "-m"])
        .arg(message);
    if let Some(author) = author {
        cmd.arg("--author").arg(author);
    }
    cmd.arg("--");
    for path in paths {
        cmd.arg(path);
    }
    cmd.run()?;
    query::head_sha(repo)
}

/// Record that untracked `paths` will be added (`git add --intent-to-add`),
/// so [`commit_only`] can name them. Their content is not staged.
pub fn add_intent(repo: &Path, paths: &[String]) -> Result<(), GitError> {
    if paths.is_empty() {
        return Ok(());
    }
    let mut cmd = literal(repo);
    cmd.args(&["add", "--intent-to-add", "--"]);
    for path in paths {
        cmd.arg(path);
    }
    cmd.run()?;
    Ok(())
}

/// Stage every change in the working tree, untracked files included, and
/// commit it as the configured identity (`git add --all`, then `commit`).
/// Returns the new commit's full sha.
pub fn commit_all(repo: &Path, message: &str) -> Result<String, GitError> {
    let mut add = git();
    add.dir(repo).args(&["add", "--all"]);
    add.run()?;
    let mut cmd = git();
    cmd.dir(repo)
        .args(&["commit", "--quiet", "-m"])
        .arg(message);
    cmd.run()?;
    query::head_sha(repo)
}

/// Revert `sha` and commit the result, touching only the paths `sha`
/// changed: `revert --no-commit`, then [`commit_only`] on those paths, so
/// other staged changes stay out. Returns the revert commit's sha.
///
/// The caller checks first that none of those paths has uncommitted
/// changes. When the revert or its commit fails, the half-done revert is
/// cleared and those paths are put back as HEAD has them before the error
/// is returned.
pub fn revert_only(repo: &Path, sha: &str, message: &str) -> Result<String, GitError> {
    let paths = query::commit_paths(repo, sha)?;
    if paths.is_empty() {
        return Err(refused("revert", "the commit changes no files"));
    }
    let mut revert = literal(repo);
    revert.args(&["revert", "--no-commit"]).arg(sha);
    let result = revert
        .run()
        .and_then(|_| commit_only(repo, &paths, message, None));
    if result.is_err() {
        restore_to_head(repo, &paths);
    }
    result
}

/// Clear a stopped revert and put `paths` back as HEAD has them. Best
/// effort: this runs after a failure whose error is the one worth reporting.
fn restore_to_head(repo: &Path, paths: &[String]) {
    let mut quit = git();
    quit.dir(repo).args(&["revert", "--quit"]);
    let _ = quit.run();
    // `restore` refuses the whole call when one path is in neither HEAD nor
    // the index, so only those it knows are named.
    let mut known = literal(repo);
    known.args(&["ls-files", "--with-tree=HEAD", "-z", "--"]);
    for path in paths {
        known.arg(path);
    }
    let Ok(known) = known.run() else {
        return;
    };
    let known: Vec<&str> = known.split('\0').filter(|p| !p.is_empty()).collect();
    if known.is_empty() {
        return;
    }
    let mut restore = literal(repo);
    restore.args(&["restore", "--source=HEAD", "--staged", "--worktree", "--"]);
    for path in known {
        restore.arg(path);
    }
    let _ = restore.run();
}

/// The remote and remote branch the current branch tracks, from
/// `branch.<name>.remote` and `branch.<name>.merge`. `None` without one.
pub fn upstream_of_head(repo: &Path) -> Result<Option<(String, String)>, GitError> {
    let Some(branch) = query::status_report(repo)?.branch else {
        return Ok(None);
    };
    let config = |key: &str| query::config_value(repo, &format!("branch.{branch}.{key}"));
    Ok(config("remote")?.zip(config("merge")?))
}

/// Push HEAD to the branch's upstream, by name, so it works whatever
/// `push.default` says. Fails when the branch has no upstream. Never prompts
/// for credentials: a push that needs them fails instead of waiting.
pub fn push_upstream(repo: &Path) -> Result<(), GitError> {
    let Some((remote, merge)) = upstream_of_head(repo)? else {
        return Err(refused("push", "the branch has no upstream"));
    };
    let mut cmd = git();
    cmd.dir(repo)
        .env("GIT_TERMINAL_PROMPT", "0")
        .args(&["push", "--quiet"])
        .arg(remote)
        .arg(format!("HEAD:{merge}"));
    cmd.run()?;
    Ok(())
}
