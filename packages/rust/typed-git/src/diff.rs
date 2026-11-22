//! What changed: the changed paths with their status, for a range, the index
//! or the working tree, the unified diff, and the merge base of two
//! revisions.
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

use crate::cmd::refuse_option;
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
    /// The path is unmerged (`U`). A diff of the working tree can list an
    /// unmerged path twice: a content conflict gives this row, then a second
    /// row for the same path ([`Modified`](Self::Modified)), and a
    /// modify/delete conflict gives this row alone. A caller that keys rows
    /// by path must keep both.
    Unmerged,
    /// A status letter this crate has no variant for, as git printed it.
    Other(char),
}

/// One row of a `--name-status` diff.
///
/// The paths are [`PathBuf`], where the rest of the crate uses `String`. The
/// NUL separated output gives each name's bytes, and on Unix a `PathBuf`
/// keeps them, where a `String` would lose a name that is not UTF-8. The
/// `paths` setters of the option structs take `&str`, so such a name cannot
/// be passed back to them.
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
    /// Set by `between` when `from` or `to` is empty.
    empty_side: bool,
    no_renames: bool,
    paths: Vec<String>,
}

impl DiffNameStatusOptions {
    /// Options that diff the working tree against the index, with rename
    /// detection as the user's git configuration sets it.
    pub fn new() -> Self {
        Self::default()
    }

    /// Diff the index against HEAD (`--cached`), or against that revision
    /// when the range is a single revision. Git refuses `--cached` with two
    /// revisions, so it does not combine with [`between`](Self::between) or
    /// with a range such as `a..b`.
    pub fn cached(mut self) -> Self {
        self.cached = true;
        self
    }

    /// Diff a range given as one token, such as `origin/main..HEAD`.
    pub fn range(mut self, range: impl Into<String>) -> Self {
        self.range = Some(range.into());
        self.empty_side = false;
        self
    }

    /// Diff `from` against `to` (`from..to`). An empty `from` or `to` is
    /// refused when the diff runs, because git reads a missing side as
    /// `HEAD`.
    pub fn between(mut self, from: &str, to: &str) -> Self {
        self.range = Some(format!("{from}..{to}"));
        self.empty_side = from.is_empty() || to.is_empty();
        self
    }

    /// Report a rename as a delete plus an add (`--no-renames`).
    pub fn no_renames(mut self) -> Self {
        self.no_renames = true;
        self
    }

    /// Limit the diff to these pathspecs. Git reads them as pathspecs, so
    /// `*.md` is a glob and a name that begins with `:` is pathspec magic.
    /// Prefix a path with `:(literal)` to match it as a file name.
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
    context: Option<u32>,
    find_renames: bool,
    paths: Vec<String>,
}

impl DiffTextOptions {
    /// Options that diff the working tree.
    pub fn new() -> Self {
        Self::default()
    }

    /// Diff the index against the revision, or against HEAD when there is no
    /// revision (`--cached`). Git refuses it with a `rev` of two revisions,
    /// such as `a..b`.
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

    /// Print `lines` lines of context around each change
    /// (`--unified=<lines>`). The default is 3, whatever `diff.context` or the
    /// `GIT_DIFF_OPTS` environment variable says; 0 gives the changed lines
    /// alone (`--inter-hunk-context=0` keeps `diff.interHunkContext` from
    /// merging nearby hunks with the lines between them).
    pub fn context(mut self, lines: u32) -> Self {
        self.context = Some(lines);
        self
    }

    /// Detect renames (`-M`), whatever `diff.renames` says, so a moved file
    /// reads as one `rename from`/`rename to` patch and not as a delete plus
    /// an add. It also overrides `diff.renames=copies`, under which a new file
    /// that copies a changed one reads as `copy from`/`copy to`: with `-M` it
    /// is a plain add. Without it `diff.renames` applies. `diff.renameLimit`
    /// still applies: past it git stops looking for renames and only warns on
    /// stderr.
    pub fn find_renames(mut self) -> Self {
        self.find_renames = true;
        self
    }

    /// Limit the diff to these pathspecs. Git reads them as pathspecs, so
    /// `*.md` is a glob and a name that begins with `:` is pathspec magic.
    /// Prefix a path with `:(literal)` to match it as a file name.
    pub fn paths(mut self, paths: &[&str]) -> Self {
        self.paths = paths.iter().map(|p| p.to_string()).collect();
        self
    }
}

/// The changed paths with their status
/// (`git diff --no-color --no-relative --name-status -z`).
///
/// An empty result means nothing differs, including before the first commit
/// with [`cached`](DiffNameStatusOptions::cached). Paths come from NUL
/// separated output, so a name holding a space, a quote, a newline or
/// non-ASCII characters is exact. A path can be in more than one row: see
/// [`ChangeKind::Unmerged`].
///
/// `--no-relative` is always passed, so with a subdirectory as `repo` the
/// paths are still relative to the repository root and changes outside the
/// subdirectory are still listed, whatever the user's `diff.relative` says.
/// `--no-color` is passed as a guard: git does not colour this output.
///
/// The range is followed by `--`, so git never reads it as a path. A range
/// that does not resolve is a [`GitError::Command`], even when it names a
/// file, as is a range that begins with `-` and a
/// [`between`](DiffNameStatusOptions::between) with an empty side.
pub fn diff_name_status(
    repo: &Path,
    opts: &DiffNameStatusOptions,
) -> Result<Vec<Change>, GitError> {
    let mut args = vec!["diff", "--no-color", "--no-relative", "--name-status", "-z"];
    if opts.cached {
        args.push("--cached");
    }
    if opts.no_renames {
        args.push("--no-renames");
    }
    if let Some(range) = &opts.range {
        if opts.empty_side {
            return Err(GitError::Command {
                command: "diff".to_string(),
                stderr: format!("refusing a range with an empty side: {range}"),
            });
        }
        refuse_option("diff", range)?;
    }
    push_rev_and_paths(&mut args, opts.range.as_deref(), &opts.paths);
    let stdout = git().dir(repo).args(&args).run_bytes()?;
    Ok(parse_name_status(&stdout))
}

/// The merge base of two revisions: the best common ancestor, as a full sha.
///
/// `None` when git finds no common ancestor. In a full clone that means the
/// histories are unrelated. In a shallow clone it is also the answer when the
/// common ancestor is past the shallow boundary. When there is more than one
/// best common ancestor git prints one of them: which one is git's choice,
/// and it can change with the order of `a` and `b`.
///
/// Exit 1 from git is read as `None`, with or without a warning on stderr,
/// unless stderr holds a line that starts with `error:` or `fatal:`. Then it
/// is a [`GitError::Command`]: some git versions also exit 1 when they cannot
/// read a commit. The command runs with `LC_ALL=C`, so git writes those two
/// words in English whatever the caller's locale. A revision that does not
/// resolve is a [`GitError::Command`], as is one that begins with `-`.
pub fn merge_base(repo: &Path, a: &str, b: &str) -> Result<Option<String>, GitError> {
    refuse_option("merge-base", a)?;
    refuse_option("merge-base", b)?;
    let mut cmd = git();
    // The answer is read from stderr's words, so git must write them in
    // English.
    cmd.dir(repo).env("LC_ALL", "C").args(&["merge-base", a, b]);
    let out = cmd.run_raw()?;
    merge_base_answer(out.status.code(), &out.stdout, &out.stderr).ok_or_else(|| cmd.failure(&out))
}

/// What one run of `git merge-base` answers: the sha, `Some(None)` for no
/// common ancestor, or `None` when the run failed.
///
/// Exit 1 is git's answer for no common ancestor, with or without a warning
/// on stderr. An `error:` or `fatal:` line with it is a failed read, not an
/// answer. A revision that does not resolve exits 128.
fn merge_base_answer(code: Option<i32>, stdout: &[u8], stderr: &[u8]) -> Option<Option<String>> {
    match code {
        Some(0) => {
            let sha = String::from_utf8_lossy(stdout).trim().to_string();
            Some((!sha.is_empty()).then_some(sha))
        }
        Some(1) if !has_error_line(stderr) => Some(None),
        _ => None,
    }
}

/// Whether git's stderr holds a line that starts with `error:` or `fatal:`.
fn has_error_line(stderr: &[u8]) -> bool {
    String::from_utf8_lossy(stderr)
        .lines()
        .any(|line| line.starts_with("error:") || line.starts_with("fatal:"))
}

/// The lines of context [`diff_text`] prints when [`DiffTextOptions::context`]
/// is unset.
const DEFAULT_CONTEXT: u32 = 3;

/// The unified diff (`git diff --no-color --no-ext-diff --no-textconv
/// --src-prefix=a/ --dst-prefix=b/ --no-relative --submodule=short
/// --inter-hunk-context=0 --unified=<context> [--cached] [--binary] [-M] [rev]
/// [--] [paths]`, with `GIT_DIFF_OPTS` removed from git's environment). `--`
/// is passed once, when there is a `rev` or a path.
///
/// With no `rev` the diff is the working tree against the index, or the index
/// against HEAD with [`staged`](DiffTextOptions::staged). With a `rev` it is
/// the working tree, or the index when staged, against that revision. The
/// text is empty when nothing differs, and it is not trimmed, so the
/// trailing newline of the last line stays. It is decoded as UTF-8 with
/// invalid bytes replaced, so a patch of a file that is not UTF-8 may not
/// apply.
///
/// The text is a plain unified diff with `a/` and `b/` prefixes. The flags that are always passed turn off escape codes
/// (`color.ui`, `color.diff`), an external diff tool (`diff.external`, a
/// `diff.<driver>.command`), textconv conversion, other prefixes
/// (`diff.noprefix`, `diff.mnemonicPrefix`, `diff.srcPrefix`,
/// `diff.dstPrefix`) and `diff.relative`, which with a subdirectory as `repo`
/// would drop changes outside it. They also keep a submodule change as a
/// `Subproject commit` patch, whatever `diff.submodule` says, and the context
/// at [`context`](DiffTextOptions::context) lines (default three), whatever
/// `diff.context`, `diff.interHunkContext` or the `GIT_DIFF_OPTS` environment
/// variable says.
///
/// Other settings still change the text: rename detection (`diff.renames`,
/// unless [`find_renames`](DiffTextOptions::find_renames) pins it on, and
/// `diff.renameLimit`), `diff.algorithm` (which lines read as changed, so the
/// line counts too), `diff.indentHeuristic` (where a hunk starts),
/// `diff.ignoreSubmodules` and `submodule.<name>.ignore` (whether a submodule
/// change is shown at all), `core.quotePath` (whether a non-ASCII path is
/// C-quoted), `diff.orderFile` (the order of the files),
/// `diff.suppressBlankEmpty` (a blank context line loses its leading space),
/// `core.abbrev` (the length of the `index` line's hashes), a
/// `diff.<driver>.xfuncname` (the function name after `@@`), and a `-diff` or
/// `binary` attribute (`Binary files … differ` in place of a patch, unless
/// [`binary`](DiffTextOptions::binary) is set). Clean filters and end-of-line
/// conversion (`core.autocrlf`, `text`, `eol` and `filter` attributes) change
/// the working-tree content git compares.
///
/// [`paths`](DiffTextOptions::paths) are read as git pathspecs, not as
/// literal file names: `*.md` and `pages/[slug].astro` are globs, and a name
/// that begins with `:` is read as pathspec magic, so it does not match the
/// file. Prefix a path with `:(literal)` to match it as a file name.
///
/// The `rev` is followed by `--`, so git never reads it as a path. A `rev`
/// that does not resolve is a [`GitError::Command`], even when it names a
/// file, as is one that begins with `-`.
pub fn diff_text(
    repo: &Path,
    rev: Option<&str>,
    opts: &DiffTextOptions,
) -> Result<String, GitError> {
    let unified = format!("--unified={}", opts.context.unwrap_or(DEFAULT_CONTEXT));
    let mut args = vec![
        "diff",
        "--no-color",
        "--no-ext-diff",
        "--no-textconv",
        "--src-prefix=a/",
        "--dst-prefix=b/",
        "--no-relative",
        "--submodule=short",
        "--inter-hunk-context=0",
        unified.as_str(),
    ];
    if opts.staged {
        args.push("--cached");
    }
    if opts.binary {
        args.push("--binary");
    }
    if opts.find_renames {
        args.push("-M");
    }
    if let Some(rev) = rev {
        refuse_option("diff", rev)?;
    }
    push_rev_and_paths(&mut args, rev, &opts.paths);
    // git reads a `-u<n>` or `--unified=<n>` in GIT_DIFF_OPTS over
    // `--unified`, so the child must not inherit it.
    let stdout = git()
        .dir(repo)
        .env_remove("GIT_DIFF_OPTS")
        .args(&args)
        .run_bytes()?;
    // Valid UTF-8, the usual case, reuses the buffer. Only invalid bytes
    // cost a copy.
    Ok(String::from_utf8(stdout)
        .unwrap_or_else(|e| String::from_utf8_lossy(e.as_bytes()).into_owned()))
}

/// Appends the revision, then `--`, then the paths. `--` follows a revision
/// even when there are no paths, so git cannot read the revision as a path.
fn push_rev_and_paths<'a>(args: &mut Vec<&'a str>, rev: Option<&'a str>, paths: &'a [String]) {
    args.extend(rev);
    if rev.is_some() || !paths.is_empty() {
        args.push("--");
    }
    args.extend(paths.iter().map(String::as_str));
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

    #[test]
    fn an_error_or_fatal_line_is_not_a_warning() {
        assert!(!has_error_line(b""));
        assert!(!has_error_line(b"warning: refname 'side' is ambiguous.\n"));
        assert!(has_error_line(b"error: Could not read 1234\n"));
        assert!(has_error_line(
            b"warning: refname 'side' is ambiguous.\nfatal: bad object\n"
        ));
    }

    #[test]
    fn merge_base_answer_reads_the_exit_code_and_stderr() {
        let sha = Some(Some("abc123".to_string()));
        assert_eq!(merge_base_answer(Some(0), b"abc123\n", b""), sha);
        assert_eq!(merge_base_answer(Some(0), b"", b""), Some(None));
        // Exit 1 is "no common ancestor", with or without a warning.
        assert_eq!(merge_base_answer(Some(1), b"", b""), Some(None));
        let warning = b"warning: refname 'side' is ambiguous.\n";
        assert_eq!(merge_base_answer(Some(1), b"", warning), Some(None));
        // An error line with exit 1 is a failed read. Only stderr is looked at.
        assert_eq!(
            merge_base_answer(Some(1), b"", b"error: Could not read 1234\n"),
            None
        );
        assert_eq!(merge_base_answer(Some(1), b"error: x\n", b""), Some(None));
        // Any other exit, or a signal, is a failure.
        assert_eq!(
            merge_base_answer(Some(128), b"", b"fatal: Not a valid object name nope\n"),
            None
        );
        assert_eq!(merge_base_answer(Some(255), b"", b""), None);
        assert_eq!(merge_base_answer(None, b"", b""), None);
    }
}
