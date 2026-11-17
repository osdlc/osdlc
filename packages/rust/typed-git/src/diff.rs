//! What changed: the files that differ between two revisions or between the
//! index and HEAD, the unified diff text for the same selections, and the
//! merge base of two revisions.
//!
//! ```
//! use std::fs;
//! use typed_git::diff::{self, ChangeKind, DiffNameStatusOptions};
//! use typed_git::{commit, git};
//!
//! # fn main() -> Result<(), Box<dyn std::error::Error>> {
//! let dir = tempfile::tempdir()?;
//! let repo = dir.path();
//! git().dir(repo).args(&["init", "--quiet"]).run()?;
//! git().dir(repo).args(&["config", "user.name", "Ex"]).run()?;
//! git().dir(repo).args(&["config", "user.email", "ex@example.com"]).run()?;
//! fs::write(repo.join("a.md"), "a\n")?;
//! let paths = vec!["a.md".to_string()];
//! commit::add_intent(repo, &paths)?;
//! commit::commit_only(repo, &paths, "Add a", None)?;
//!
//! // Stage a second file and list what the index adds to HEAD.
//! fs::write(repo.join("b.md"), "b\n")?;
//! git().dir(repo).args(&["add", "b.md"]).run()?;
//! let staged = diff::diff_name_status(repo, &DiffNameStatusOptions::new().cached())?;
//! assert_eq!(staged.len(), 1);
//! assert_eq!(staged[0].kind, ChangeKind::Added);
//! assert_eq!(staged[0].path.to_str(), Some("b.md"));
//! # Ok(())
//! # }
//! ```

use std::path::{Path, PathBuf};

use crate::{GitError, git};

/// How git classifies one changed path in a `--name-status` diff.
///
/// The enum is `#[non_exhaustive]`, so a `match` on it needs a `_` arm.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[non_exhaustive]
pub enum ChangeKind {
    /// The path is new (`A`).
    Added,
    /// The content or mode changed (`M`).
    Modified,
    /// The path is gone (`D`).
    Deleted,
    /// The path was moved. [`Change::from`] holds the old path (`R`).
    Renamed,
    /// The path was copied from another. [`Change::from`] holds the source
    /// path (`C`).
    Copied,
    /// The file type changed, such as a file replaced by a symlink (`T`).
    TypeChanged,
    /// The path is unmerged (`U`).
    Unmerged,
    /// A status letter this crate has no variant for, as git printed it.
    Other(char),
}

/// One row of a `--name-status` diff.
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub struct Change {
    /// The status of the path.
    pub kind: ChangeKind,
    /// The path the status is about, relative to the repository root. For a
    /// rename or copy this is the destination, where the file is now.
    pub path: PathBuf,
    /// The source path of a rename or copy. `None` for every other status.
    pub from: Option<PathBuf>,
    /// The similarity percentage git scored a rename or copy with (`R085` is
    /// `85`). `None` for every other status.
    pub score: Option<u8>,
}

/// Options for [`diff_name_status`].
///
/// Start from [`new`](Self::new) and chain the setters.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
#[non_exhaustive]
pub struct DiffNameStatusOptions {
    cached: bool,
    range: Option<String>,
    no_renames: bool,
    paths: Vec<String>,
}

impl DiffNameStatusOptions {
    /// Options that diff the working tree against the index, with rename
    /// detection as the user's git configuration sets it.
    pub fn new() -> Self {
        Self::default()
    }

    /// Diff the index against HEAD (`--cached`), or against the range's first
    /// revision when a range is also set.
    pub fn cached(mut self) -> Self {
        self.cached = true;
        self
    }

    /// Diff a range given as one token, such as `origin/main..HEAD`.
    pub fn range(mut self, range: impl Into<String>) -> Self {
        self.range = Some(range.into());
        self
    }

    /// Diff `from` against `to` (`from..to`).
    pub fn between(self, from: &str, to: &str) -> Self {
        self.range(format!("{from}..{to}"))
    }

    /// Report a rename as a delete plus an add (`--no-renames`).
    pub fn no_renames(mut self) -> Self {
        self.no_renames = true;
        self
    }

    /// Limit the diff to these pathspecs. Git reads them as pathspecs, so
    /// `*.md` is a glob.
    pub fn paths(mut self, paths: &[&str]) -> Self {
        self.paths = paths.iter().map(|p| p.to_string()).collect();
        self
    }
}

/// Options for [`diff_text`].
///
/// Start from [`new`](Self::new) and chain the setters.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
#[non_exhaustive]
pub struct DiffTextOptions {
    staged: bool,
    binary: bool,
    paths: Vec<String>,
}

impl DiffTextOptions {
    /// Options that diff the working tree.
    pub fn new() -> Self {
        Self::default()
    }

    /// Diff the index against the revision, or against HEAD when there is no
    /// revision (`--cached`).
    pub fn staged(mut self) -> Self {
        self.staged = true;
        self
    }

    /// Write a binary file's change as a `GIT binary patch` that `git apply`
    /// can replay, instead of one `Binary files differ` line (`--binary`).
    pub fn binary(mut self) -> Self {
        self.binary = true;
        self
    }

    /// Limit the diff to these pathspecs. Git reads them as pathspecs, so
    /// `*.md` is a glob.
    pub fn paths(mut self, paths: &[&str]) -> Self {
        self.paths = paths.iter().map(|p| p.to_string()).collect();
        self
    }
}

/// The changed paths with their status
/// (`git diff --no-color --name-status -z`).
///
/// An empty result means nothing differs, including before the first commit
/// with [`cached`](DiffNameStatusOptions::cached). Paths come from NUL
/// separated output, so a name holding a space, a quote, a newline or
/// non-ASCII characters is exact. `--no-color` is always passed, so the
/// user's `color.ui` or `color.diff` setting cannot put escape codes in the
/// output. A range or revision that does not resolve is a
/// [`GitError::Command`], as is a range that begins with `-`.
pub fn diff_name_status(
    repo: &Path,
    opts: &DiffNameStatusOptions,
) -> Result<Vec<Change>, GitError> {
    let mut args = vec!["diff", "--no-color", "--name-status", "-z"];
    if opts.cached {
        args.push("--cached");
    }
    if opts.no_renames {
        args.push("--no-renames");
    }
    if let Some(range) = &opts.range {
        refuse_option(&args, range)?;
        args.push(range);
    }
    push_paths(&mut args, &opts.paths);
    Ok(parse_name_status(&run_bytes(repo, &args)?))
}

/// The merge base of two revisions: the best common ancestor, as a full sha.
///
/// `None` when the histories share no commit. A revision that does not
/// resolve is a [`GitError::Command`], as is one that begins with `-`.
pub fn merge_base(repo: &Path, a: &str, b: &str) -> Result<Option<String>, GitError> {
    let args = ["merge-base", a, b];
    refuse_option(&args[..1], a)?;
    refuse_option(&args[..1], b)?;
    let out = git().dir(repo).args(&args).run_raw()?;
    match out.status.code() {
        Some(0) => {
            let sha = String::from_utf8_lossy(&out.stdout).trim().to_string();
            Ok((!sha.is_empty()).then_some(sha))
        }
        // Exit 1 is git's answer for histories with no common ancestor. A
        // revision that does not resolve exits 128 and falls through.
        Some(1) if out.stderr.is_empty() => Ok(None),
        _ => Err(failure(&args, &out.stderr)),
    }
}

/// The unified diff
/// (`git diff --no-color [--cached] [--binary] [rev] [-- paths]`).
///
/// With no `rev` the diff is the working tree against the index, or the index
/// against HEAD with [`staged`](DiffTextOptions::staged). With a `rev` it is
/// the working tree, or the index when staged, against that revision. The
/// text is empty when nothing differs, and it is not trimmed, so the
/// trailing newline of the last line stays. It is decoded as UTF-8 with
/// invalid bytes replaced, so a patch of a file that is not UTF-8 may not
/// apply. `--no-color` is always passed, so the text holds no escape codes
/// whatever the user's `color.ui` or `color.diff` says.
///
/// [`paths`](DiffTextOptions::paths) are read as git pathspecs, not as
/// literal file names: `*.md` and `pages/[slug].astro` are globs. The
/// function takes no environment, so a caller cannot set
/// `GIT_LITERAL_PATHSPECS` through it.
///
/// A `rev` that does not resolve is a [`GitError::Command`], as is one that
/// begins with `-`.
pub fn diff_text(
    repo: &Path,
    rev: Option<&str>,
    opts: &DiffTextOptions,
) -> Result<String, GitError> {
    let mut args = vec!["diff", "--no-color"];
    if opts.staged {
        args.push("--cached");
    }
    if opts.binary {
        args.push("--binary");
    }
    if let Some(rev) = rev {
        refuse_option(&args, rev)?;
        args.push(rev);
    }
    push_paths(&mut args, &opts.paths);
    Ok(String::from_utf8_lossy(&run_bytes(repo, &args)?).into_owned())
}

/// Appends `-- <paths>` when there are paths.
fn push_paths<'a>(args: &mut Vec<&'a str>, paths: &'a [String]) {
    if paths.is_empty() {
        return;
    }
    args.push("--");
    args.extend(paths.iter().map(String::as_str));
}

/// Runs git and returns stdout untrimmed. `run` trims, which would cost a
/// diff its last newline.
fn run_bytes(repo: &Path, args: &[&str]) -> Result<Vec<u8>, GitError> {
    let out = git().dir(repo).args(args).run_raw()?;
    if out.status.success() {
        Ok(out.stdout)
    } else {
        Err(failure(args, &out.stderr))
    }
}

/// A `GitError::Command` for a git call that exited non-zero.
fn failure(args: &[&str], stderr: &[u8]) -> GitError {
    GitError::Command {
        command: format!("git {}", args.join(" ")),
        stderr: String::from_utf8_lossy(stderr).trim().to_string(),
    }
}

/// Refuses a value that git would read as an option. `args` is the command
/// line so far, for the error.
fn refuse_option(args: &[&str], value: &str) -> Result<(), GitError> {
    if value.starts_with('-') {
        return Err(GitError::Command {
            command: format!("git {}", args.join(" ")),
            stderr: format!("refusing a value that begins with '-': {value}"),
        });
    }
    Ok(())
}

/// Parses `--name-status -z`.
///
/// A plain record is two fields (`M`, path) but a rename or copy is three
/// (`R100`, old path, new path), so a parser that pairs fields would lose
/// its place at the first rename.
fn parse_name_status(raw: &[u8]) -> Vec<Change> {
    let mut fields = raw.split(|&b| b == 0).filter(|f| !f.is_empty());
    let mut out = Vec::new();
    while let Some(status) = fields.next() {
        let status = String::from_utf8_lossy(status);
        let mut chars = status.chars();
        let letter = chars.next().unwrap_or('?');
        let score = chars.as_str().parse::<u8>().ok();
        let kind = match letter {
            'A' => ChangeKind::Added,
            'M' => ChangeKind::Modified,
            'D' => ChangeKind::Deleted,
            'R' => ChangeKind::Renamed,
            'C' => ChangeKind::Copied,
            'T' => ChangeKind::TypeChanged,
            'U' => ChangeKind::Unmerged,
            other => ChangeKind::Other(other),
        };
        let pair = matches!(kind, ChangeKind::Renamed | ChangeKind::Copied);
        let first = fields.next();
        let (from, path) = if pair {
            (first, fields.next())
        } else {
            (None, first)
        };
        // A truncated trailing record has no path to report.
        let Some(path) = path else { break };
        out.push(Change {
            kind,
            path: bytes_to_path(path),
            from: from.map(bytes_to_path),
            score: pair.then_some(score).flatten(),
        });
    }
    out
}

/// A path from git's bytes. On Unix the bytes are kept as they are; elsewhere
/// invalid UTF-8 is replaced, as the rest of the crate does.
fn bytes_to_path(bytes: &[u8]) -> PathBuf {
    #[cfg(unix)]
    {
        use std::os::unix::ffi::OsStringExt;
        PathBuf::from(std::ffi::OsString::from_vec(bytes.to_vec()))
    }
    #[cfg(not(unix))]
    {
        PathBuf::from(String::from_utf8_lossy(bytes).into_owned())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_plain_and_paired_records() {
        let raw = b"M\0a b.md\0R095\0old.md\0new.md\0D\0gone.md\0";
        let rows = parse_name_status(raw);
        assert_eq!(rows.len(), 3);
        assert_eq!(rows[0].kind, ChangeKind::Modified);
        assert_eq!(rows[0].path, PathBuf::from("a b.md"));
        assert_eq!(rows[1].kind, ChangeKind::Renamed);
        assert_eq!(rows[1].from, Some(PathBuf::from("old.md")));
        assert_eq!(rows[1].path, PathBuf::from("new.md"));
        assert_eq!(rows[1].score, Some(95));
        assert_eq!(rows[2].kind, ChangeKind::Deleted);
        assert_eq!(rows[2].from, None);
    }

    #[test]
    fn drops_a_truncated_record() {
        assert!(parse_name_status(b"R100\0old.md\0").is_empty());
        assert!(parse_name_status(b"").is_empty());
    }

    #[test]
    fn keeps_an_unknown_letter() {
        let rows = parse_name_status(b"X\0p\0");
        assert_eq!(rows[0].kind, ChangeKind::Other('X'));
    }
}
