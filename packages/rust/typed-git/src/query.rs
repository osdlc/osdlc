//! Read-only questions about a repository.
//!
//! A path goes in and a value comes out. Each function runs one or a few
//! git commands and changes nothing. The path may be any directory inside a
//! repository: the main checkout, a linked worktree or a subdirectory.
//!
//! ```
//! use std::fs;
//! use typed_git::{git, query};
//! use typed_git::query::FileState;
//!
//! # fn main() -> Result<(), Box<dyn std::error::Error>> {
//! let dir = tempfile::tempdir()?;
//! let repo = dir.path();
//! git().dir(repo).args(&["init", "--quiet"]).run()?;
//! fs::write(repo.join("notes.md"), "hello\n")?;
//!
//! let report = query::status_report(repo)?;
//! assert_eq!(report.upstream, None);
//! assert_eq!(report.entries.len(), 1);
//! assert_eq!(report.entries[0].path, "notes.md");
//! assert_eq!(report.entries[0].state, FileState::Untracked);
//! assert!(!query::is_clean(repo)?);
//! # Ok(())
//! # }
//! ```

use std::path::Path;

use crate::{GitError, git};

/// Current HEAD commit SHA (full 40-char hash).
pub fn head_sha(repo: &Path) -> Result<String, GitError> {
    let mut cmd = git();
    cmd.dir(repo).args(&["rev-parse", "HEAD"]);
    cmd.run()
}

/// The current branch name, such as `main` or `feature/x`. Returns the text
/// `HEAD` when HEAD is detached.
pub fn current_branch(repo: &Path) -> Result<String, GitError> {
    let mut cmd = git();
    cmd.dir(repo).args(&["rev-parse", "--abbrev-ref", "HEAD"]);
    cmd.run()
}

/// Is this path inside a git work tree?
pub fn is_repo(path: &Path) -> Result<bool, GitError> {
    let mut cmd = git();
    cmd.dir(path).args(&["rev-parse", "--is-inside-work-tree"]);
    cmd.check()
}

/// Does HEAD point to a valid commit?
pub fn has_valid_head(repo: &Path) -> Result<bool, GitError> {
    let mut cmd = git();
    cmd.dir(repo).args(&["rev-parse", "--verify", "HEAD"]);
    cmd.check()
}

/// Is the working tree clean (no uncommitted changes)?
pub fn is_clean(repo: &Path) -> Result<bool, GitError> {
    let mut cmd = git();
    cmd.dir(repo).args(&["status", "--porcelain"]);
    let output = cmd.run()?;
    Ok(output.is_empty())
}

/// Does a local branch exist?
pub fn branch_exists(repo: &Path, name: &str) -> Result<bool, GitError> {
    let mut cmd = git();
    cmd.dir(repo)
        .args(&["rev-parse", "--verify"])
        .arg(format!("refs/heads/{name}"));
    cmd.check()
}

/// Diff stat between two commits.
pub fn diff_stat(repo: &Path, from: &str, to: &str) -> Result<String, GitError> {
    let mut cmd = git();
    cmd.dir(repo).args(&["diff", "--stat"]).arg(from).arg(to);
    cmd.run()
}

/// Short log between two refs.
pub fn log_oneline(repo: &Path, range: &str, max: usize) -> Result<Vec<String>, GitError> {
    let mut cmd = git();
    cmd.dir(repo)
        .args(&["log", "--oneline"])
        .arg(format!("-{max}"))
        .arg(range);
    let output = cmd.run()?;
    Ok(output.lines().map(String::from).collect())
}

/// Porcelain status output.
pub fn status_short(repo: &Path) -> Result<String, GitError> {
    let mut cmd = git();
    cmd.dir(repo).args(&["status", "--short"]);
    cmd.run()
}

/// What stops a commit from being an ordinary one right now.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
#[non_exhaustive]
pub struct RepoState {
    /// `MERGE_HEAD` exists: a merge stopped for the user to finish.
    pub merging: bool,
    /// `rebase-merge/` or `rebase-apply/` exists: a rebase (or `git am`) is
    /// under way.
    pub rebasing: bool,
    /// HEAD names a commit, not a branch.
    pub detached: bool,
}

/// Merge, rebase and detached-HEAD state.
///
/// The marker files are found with `rev-parse --git-path`, so a linked
/// worktree reads its own git directory rather than the main checkout's.
pub fn repo_state(repo: &Path) -> Result<RepoState, GitError> {
    let mut symbolic = git();
    symbolic.dir(repo).args(&["symbolic-ref", "-q", "HEAD"]);
    Ok(RepoState {
        merging: git_path(repo, "MERGE_HEAD")?.exists(),
        rebasing: git_path(repo, "rebase-merge")?.exists()
            || git_path(repo, "rebase-apply")?.exists(),
        detached: !symbolic.check()?,
    })
}

/// Where `name` lives inside the git directory. git answers relative to the
/// working directory it ran in, or absolute.
pub fn git_path(repo: &Path, name: &str) -> Result<std::path::PathBuf, GitError> {
    let mut cmd = git();
    cmd.dir(repo).args(&["rev-parse", "--git-path"]).arg(name);
    Ok(repo.join(cmd.run()?))
}

/// The paths one commit changed, repository-relative. A rename lists both
/// its old and its new path.
pub fn commit_paths(repo: &Path, sha: &str) -> Result<Vec<String>, GitError> {
    let mut cmd = git();
    cmd.dir(repo)
        .args(&[
            "diff-tree",
            "--root",
            "--no-commit-id",
            "--no-renames",
            "--name-only",
            "-r",
            "-z",
        ])
        .arg(sha);
    Ok(cmd
        .run()?
        .split('\0')
        .filter(|p| !p.is_empty())
        .map(String::from)
        .collect())
}

/// A config value as git reads it in `repo` (local, then global and system).
/// `None` when the key is not set.
pub fn config_value(repo: &Path, key: &str) -> Result<Option<String>, GitError> {
    let mut cmd = git();
    cmd.dir(repo).args(&["config", "--get"]).arg(key);
    let out = cmd.run_raw()?;
    Ok(out
        .status
        .success()
        .then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
        .filter(|v| !v.is_empty()))
}

/// The first line of a commit's message.
pub fn commit_subject(repo: &Path, sha: &str) -> Result<String, GitError> {
    let mut cmd = git();
    cmd.dir(repo).args(&["log", "-1", "--format=%s"]).arg(sha);
    cmd.run()
}

/// The full sha of `rev`, which must name a commit.
pub fn resolve_commit(repo: &Path, rev: &str) -> Result<String, GitError> {
    let mut cmd = git();
    cmd.dir(repo)
        .args(&["rev-parse", "--verify", "--quiet"])
        .arg(format!("{rev}^{{commit}}"));
    cmd.run()
}

/// `path`'s bytes at `rev`, relative to `repo`. `None` when `rev` does not
/// resolve or does not hold the path.
pub fn file_at(repo: &Path, rev: &str, path: &str) -> Result<Option<Vec<u8>>, GitError> {
    let mut cmd = git();
    cmd.dir(repo).arg("show").arg(format!("{rev}:./{path}"));
    let out = cmd.run_raw()?;
    Ok(out.status.success().then_some(out.stdout))
}

/// The abbreviated sha git would print for `sha`.
pub fn short_sha(repo: &Path, sha: &str) -> Result<String, GitError> {
    let mut cmd = git();
    cmd.dir(repo).args(&["rev-parse", "--short"]).arg(sha);
    cmd.run()
}

// `status_short` above answers with git's own text. Everything below parses
// `--porcelain=v2 --branch -z` instead, which is one call for the branch, the
// upstream, the ahead/behind counts and the per-path state — and a format git
// documents as stable for machines, unlike `--short`, whose two-column codes
// have to be decoded by the caller.

/// What changed about one path, one answer per `git status` record.
///
/// A `u` record is [`Conflicted`](Self::Conflicted) and a `?` record
/// [`Untracked`](Self::Untracked). A `1` (changed) or `2` (renamed) record is
/// [`Modified`](Self::Modified) when its worktree column shows a change and
/// [`Staged`](Self::Staged) when it does not, so a path staged and then
/// edited again is `Modified`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[non_exhaustive]
pub enum FileState {
    /// Unmerged. Both sides touched it and the merge did not resolve.
    Conflicted,
    /// Neither tracked nor ignored.
    Untracked,
    /// The working tree differs from the index, whether or not something is
    /// also staged.
    Modified,
    /// The index differs from HEAD and the working tree matches the index —
    /// staged, and nothing since.
    Staged,
}

/// One changed path.
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub struct StatusEntry {
    /// Repository-relative and forward-slashed — git's own spelling, which is
    /// already forward-slashed on every platform.
    pub path: String,
    /// How the path differs from HEAD.
    pub state: FileState,
}

/// A repository's whole status: where HEAD is, what it tracks, and what has
/// changed since.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
#[non_exhaustive]
pub struct StatusReport {
    /// The checked-out branch. `None` in detached HEAD.
    pub branch: Option<String>,
    /// The upstream this branch tracks (`origin/main`), when it has one.
    pub upstream: Option<String>,
    /// Commits on this branch the upstream does not have. `None` when there
    /// is no upstream, which is not the same as zero.
    pub ahead: Option<u64>,
    /// Commits on the upstream this branch does not have. `None` for the same
    /// reason as [`ahead`](Self::ahead).
    pub behind: Option<u64>,
    /// One entry per changed path. Empty means a clean tree.
    pub entries: Vec<StatusEntry>,
}

/// Branch, upstream, ahead/behind and per-path state, in one `git status`.
///
/// Ignored files are never reported: `--ignored` is not passed, so a `!`
/// record cannot appear.
pub fn status_report(repo: &Path) -> Result<StatusReport, GitError> {
    let mut cmd = git();
    cmd.dir(repo)
        .args(&["status", "--porcelain=v2", "--branch", "-z"]);
    Ok(parse_status_v2(&cmd.run()?))
}

/// [`status_report`] limited to `paths`, so a large tree is not walked.
/// Untracked files are listed one by one (`-uall`), never as their folder.
pub fn status_report_of(repo: &Path, paths: &[&str]) -> Result<StatusReport, GitError> {
    let mut cmd = git();
    cmd.dir(repo)
        .args(&["status", "--porcelain=v2", "--branch", "-z", "-uall", "--"])
        .args(paths);
    Ok(parse_status_v2(&cmd.run()?))
}

/// Parse `--porcelain=v2 --branch -z`.
///
/// Records are NUL-separated, which is what makes a path holding a space, a
/// newline or a quote parse correctly — the `-z` format is the only one git
/// documents as unambiguous. A rename (`2`) record is the one shape that
/// spans TWO records: its original path follows in its own NUL field, and is
/// consumed and dropped here because a rename's one interesting path is where
/// the file is now.
fn parse_status_v2(raw: &str) -> StatusReport {
    let mut report = StatusReport::default();
    let mut records = raw.split('\0').filter(|r| !r.is_empty());

    while let Some(record) = records.next() {
        let Some((kind, rest)) = record.split_once(' ') else {
            continue;
        };
        match kind {
            "#" => read_header(&mut report, rest),
            // `1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>` — eight fields
            // after the record kind, the last of which is the path.
            "1" => report.entries.extend(tracked_entry(rest, 8)),
            // `2 …` adds a `<X><score>` field before the path, and carries
            // its original path in the next record.
            "2" => {
                let entry = tracked_entry(rest, 9);
                records.next();
                report.entries.extend(entry);
            }
            // `u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>`.
            "u" => {
                if let Some(path) = last_field(rest, 10) {
                    report.entries.push(StatusEntry {
                        path,
                        state: FileState::Conflicted,
                    });
                }
            }
            "?" => report.entries.push(StatusEntry {
                path: rest.to_string(),
                state: FileState::Untracked,
            }),
            _ => {}
        }
    }

    report
}

/// One `# branch.<key> <value>` header.
fn read_header(report: &mut StatusReport, rest: &str) {
    let Some((key, value)) = rest.split_once(' ') else {
        return;
    };
    match key {
        // git spells detached HEAD as a literal, which is not a branch name.
        "branch.head" => report.branch = (value != "(detached)").then(|| value.to_string()),
        "branch.upstream" => report.upstream = Some(value.to_string()),
        // `+<ahead> -<behind>`, emitted only when there IS an upstream.
        "branch.ab" => {
            if let Some((ahead, behind)) = value.split_once(' ') {
                report.ahead = ahead.strip_prefix('+').and_then(|n| n.parse().ok());
                report.behind = behind.strip_prefix('-').and_then(|n| n.parse().ok());
            }
        }
        _ => {}
    }
}

/// A `1` or `2` record: its state comes from the `XY` field, its path is the
/// last of `fields`.
fn tracked_entry(rest: &str, fields: usize) -> Option<StatusEntry> {
    let xy = rest.split(' ').next()?;
    let mut codes = xy.chars();
    let _staged = codes.next()?;
    let worktree = codes.next()?;
    Some(StatusEntry {
        path: last_field(rest, fields)?,
        // A worktree column that is not `.` means the file has moved on since
        // it was staged, so "modified" is the state a caller has to answer
        // for; `.` there leaves the staged change as the whole story.
        state: if worktree == '.' {
            FileState::Staged
        } else {
            FileState::Modified
        },
    })
}

/// The last of `fields` space-separated fields, kept whole so a path holding
/// spaces survives.
fn last_field(rest: &str, fields: usize) -> Option<String> {
    let path = rest.splitn(fields, ' ').nth(fields - 1)?;
    (!path.is_empty()).then(|| path.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Join records the way `-z` does: every record NUL-TERMINATED, so the
    /// real output ends with one and parsing has to tolerate the empty tail.
    fn porcelain(records: &[&str]) -> String {
        records.iter().map(|r| format!("{r}\0")).collect()
    }

    #[test]
    fn the_branch_headers_carry_upstream_and_ahead_behind() {
        let report = parse_status_v2(&porcelain(&[
            "# branch.oid 1111111111111111111111111111111111111111",
            "# branch.head main",
            "# branch.upstream origin/main",
            "# branch.ab +2 -3",
        ]));
        assert_eq!(report.branch.as_deref(), Some("main"));
        assert_eq!(report.upstream.as_deref(), Some("origin/main"));
        assert_eq!(report.ahead, Some(2));
        assert_eq!(report.behind, Some(3));
        assert!(report.entries.is_empty());
    }

    #[test]
    fn a_detached_head_names_no_branch() {
        let report = parse_status_v2(&porcelain(&["# branch.head (detached)"]));
        assert_eq!(report.branch, None);
    }

    #[test]
    fn no_upstream_leaves_ahead_and_behind_unknown_rather_than_zero() {
        // See StatusReport::ahead above: no upstream is unknown, not zero.
        let report = parse_status_v2(&porcelain(&["# branch.head main"]));
        assert_eq!(report.ahead, None);
        assert_eq!(report.behind, None);
    }

    #[test]
    fn each_record_kind_maps_to_its_state() {
        let report = parse_status_v2(&porcelain(&[
            "1 .M N... 100644 100644 100644 aaa bbb worktree.md",
            "1 M. N... 100644 100644 100644 aaa bbb staged.md",
            "1 MM N... 100644 100644 100644 aaa bbb staged-then-edited.md",
            "u UU N... 100644 100644 100644 100644 aaa bbb ccc conflict.md",
            "? untracked.md",
        ]));
        let states: Vec<_> = report
            .entries
            .iter()
            .map(|e| (e.path.as_str(), e.state))
            .collect();
        assert_eq!(
            states,
            vec![
                ("worktree.md", FileState::Modified),
                ("staged.md", FileState::Staged),
                // See tracked_entry: a worktree column other than `.` means Modified.
                ("staged-then-edited.md", FileState::Modified),
                ("conflict.md", FileState::Conflicted),
                ("untracked.md", FileState::Untracked),
            ]
        );
    }

    #[test]
    fn a_rename_reports_where_the_file_is_now_and_swallows_the_original() {
        // See parse_status_v2: the "2" record's original path is consumed there.
        let report = parse_status_v2(&porcelain(&[
            "2 R. N... 100644 100644 100644 aaa bbb R100 after.md",
            "before.md",
            "? untracked.md",
        ]));
        assert_eq!(
            report
                .entries
                .iter()
                .map(|e| e.path.as_str())
                .collect::<Vec<_>>(),
            vec!["after.md", "untracked.md"]
        );
    }

    #[test]
    fn a_path_holding_spaces_survives_whole() {
        let report = parse_status_v2(&porcelain(&[
            "1 .M N... 100644 100644 100644 aaa bbb notes/a note with spaces.md",
            "? an untracked one.md",
        ]));
        assert_eq!(
            report
                .entries
                .iter()
                .map(|e| e.path.as_str())
                .collect::<Vec<_>>(),
            vec!["notes/a note with spaces.md", "an untracked one.md"]
        );
    }

    #[test]
    fn a_clean_repository_reports_no_entries() {
        let report = parse_status_v2(&porcelain(&["# branch.head main", "# branch.ab +0 -0"]));
        assert!(report.entries.is_empty());
        assert_eq!(report.ahead, Some(0));
    }
}
