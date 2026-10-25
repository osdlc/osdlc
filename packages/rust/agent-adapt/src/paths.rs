//! Containment for caller-supplied relative paths.
//!
//! Every render in this crate turns authored content into an
//! [`ExportedFile`](crate::ExportedFile) whose path is some root joined
//! with a string the *caller* controls — a
//! [`SkillResource::relative_path`](crate::SkillResource::relative_path),
//! an [`Agent::slug`](crate::Agent::slug), a
//! [`Script::slug`](crate::Script::slug). `Path::join` is the wrong
//! primitive for that on its own, twice over:
//!
//! * `a/b".join("../../etc/evil")` happily produces `a/b/../../etc/evil`,
//!   which resolves outside `a/b`;
//! * `a/b".join("/etc/evil")` **discards `a/b` entirely** — joining an
//!   absolute path replaces the prefix rather than appending to it.
//!
//! [`join_within`] is the only sanctioned way to combine a root with a
//! caller-supplied path in this crate. It refuses anything that would not
//! land strictly inside the root, and it refuses rather than rewrites: a
//! silently normalised path hides the input that produced it, so the
//! caller never learns their content was mangled.
//!
//! # The rule
//!
//! A path is accepted only when it
//!
//! 1. is non-empty,
//! 2. is not absolute or rooted (`/x`, `\x`, and — checked on *every*
//!    platform, not just Windows — `C:\x` and `\\server\share\x`),
//! 3. contains no `.` or `..` segment, treating both `/` and `\` as
//!    separators regardless of host platform,
//! 4. contains no empty segment (a leading, trailing, or doubled
//!    separator), and
//! 5. after joining, still starts with the root and extends it by at
//!    least one component.
//!
//! Rules 3 and 4 are deliberately stricter than the `Component`-matching
//! check the same idea usually gets written as. `Path::components()`
//! normalises `.` and doubled separators away before you can see them, so
//! a `Component`-based check accepts `a/./b` and `a//b` silently and only
//! catches a *leading* `.`; and `Component::Prefix` never matches on Unix,
//! so `C:\Windows\evil.md` passes a Unix-side check and then escapes when
//! the very same content is written on Windows. Refusing the raw segments
//! is platform-independent and shows the caller exactly what they sent.
//!
//! The check is purely lexical, so it neither depends on the path existing
//! nor can be defeated by a symlink race — but by the same token it cannot
//! see through a symlink. Renders in this crate are pure and produce paths
//! relative to an anchor supplied later, so there is nothing to
//! canonicalise here. A layer that owns a real destination root should
//! canonicalise both sides before it writes, in addition to this check.

use std::path::{Path, PathBuf};

use crate::{Error, Result};

/// Join `relative` onto `root`, refusing anything that would escape.
///
/// See the [module docs](self) for the exact rule. On refusal the error is
/// [`Error::UnsafePath`], which names the offending path verbatim.
///
/// # Examples
///
/// ```
/// use std::path::{Path, PathBuf};
/// use agent_adapt::paths::join_within;
///
/// let root = Path::new(".claude/skills/my-skill");
/// assert_eq!(
///     join_within(root, "scripts/run.sh").unwrap(),
///     PathBuf::from(".claude/skills/my-skill/scripts/run.sh"),
/// );
///
/// // A `..` segment escapes the directory.
/// let err = join_within(root, "../../../../etc/evil.sh").unwrap_err();
/// assert!(err.to_string().contains("../../../../etc/evil.sh"));
///
/// // An absolute path would replace the root outright.
/// assert!(join_within(root, "/absolute/evil.md").is_err());
/// ```
///
/// # Errors
///
/// [`Error::UnsafePath`] when `relative` is empty, absolute, rooted,
/// drive- or UNC-prefixed, or carries a `.`, `..`, or empty segment.
pub fn join_within(root: &Path, relative: impl AsRef<Path>) -> Result<PathBuf> {
    let relative = relative.as_ref();
    let as_str = relative.to_string_lossy();
    if let Err(reason) = check_relative(&as_str) {
        return Err(Error::unsafe_path(as_str, reason));
    }
    let joined = root.join(relative);
    // Belt and braces. The segment check above already rules these out;
    // this catches any future platform where `join` surprises us, and it
    // is the clause that states the invariant callers actually depend on.
    if !joined.starts_with(root) {
        return Err(Error::unsafe_path(as_str, LEAVES_ROOT));
    }
    if joined.components().count() <= root.components().count() {
        return Err(Error::unsafe_path(as_str, NO_NEW_COMPONENT));
    }
    Ok(joined)
}

const LEAVES_ROOT: &str = "joining it does not stay under the destination directory";
const NO_NEW_COMPONENT: &str =
    "it names the destination directory itself rather than a file inside it";

/// The lexical half of the rule. Returns the refusal reason, or `Ok` when
/// the path is a safe relative path.
fn check_relative(relative: &str) -> std::result::Result<(), &'static str> {
    if relative.is_empty() {
        return Err("it is empty");
    }
    let as_path = Path::new(relative);
    if as_path.is_absolute() || as_path.has_root() {
        return Err("it is absolute — joining it would replace the destination directory");
    }
    // A Windows drive prefix is only `Component::Prefix` on Windows. Catch
    // it everywhere: content validated on one platform gets written on
    // another.
    let bytes = relative.as_bytes();
    if bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' {
        return Err("it carries a drive-letter prefix");
    }
    for segment in relative.split(['/', '\\']) {
        match segment {
            "" => {
                return Err("it has an empty segment — a leading, trailing, or doubled separator");
            }
            "." => return Err("it has a `.` segment"),
            ".." => return Err("it has a `..` segment — that escapes the destination directory"),
            _ => {}
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const ROOT: &str = ".claude/skills/escape";

    fn refuse(relative: &str) -> String {
        join_within(Path::new(ROOT), relative)
            .expect_err(&format!("{relative:?} must be refused"))
            .to_string()
    }

    #[test]
    fn accepts_a_plain_peer_file() {
        assert_eq!(
            join_within(Path::new(ROOT), "notes.md").unwrap(),
            PathBuf::from(".claude/skills/escape/notes.md")
        );
    }

    #[test]
    fn accepts_a_nested_peer_file() {
        assert_eq!(
            join_within(Path::new(ROOT), "scripts/run.sh").unwrap(),
            PathBuf::from(".claude/skills/escape/scripts/run.sh")
        );
    }

    #[test]
    fn accepts_a_dotfile_and_a_dotted_name() {
        assert!(join_within(Path::new(ROOT), ".gitignore").is_ok());
        assert!(join_within(Path::new(ROOT), "..leading-dots.md").is_ok());
        assert!(join_within(Path::new(ROOT), "a..b/c.md").is_ok());
    }

    #[test]
    fn refuses_parent_segments() {
        for input in [
            "../evil.md",
            "../../../../etc/evil.sh",
            "a/../../evil.md",
            "a/b/../../../evil.md",
            "sub/..",
            "..",
        ] {
            let msg = refuse(input);
            assert!(msg.contains(input), "{msg} must name {input:?}");
        }
    }

    #[test]
    fn refuses_a_dotdot_that_would_still_land_inside() {
        // Normalising this to `b.md` and accepting it would hide the input.
        let msg = refuse("a/../b.md");
        assert!(msg.contains("`..`"), "{msg}");
    }

    #[test]
    fn refuses_absolute_paths() {
        for input in ["/absolute/evil.md", "/evil.md"] {
            let msg = refuse(input);
            assert!(msg.contains(input), "{msg} must name {input:?}");
            assert!(msg.contains("absolute"), "{msg}");
        }
    }

    #[test]
    fn refuses_windows_roots_on_every_platform() {
        assert!(refuse("C:\\Windows\\evil.md").contains("drive-letter"));
        assert!(refuse("c:evil.md").contains("drive-letter"));
        assert!(!refuse("\\\\server\\share\\evil.md").is_empty());
        assert!(!refuse("\\evil.md").is_empty());
        assert!(refuse("a\\..\\evil.md").contains("`..`"));
    }

    #[test]
    fn refuses_current_dir_segments() {
        assert!(refuse("./evil.md").contains("`.`"));
        assert!(refuse("a/./b.md").contains("`.`"));
        assert!(refuse(".").contains("`.`"));
    }

    #[test]
    fn refuses_empty_segments() {
        assert!(refuse("a//b.md").contains("empty segment"));
        assert!(refuse("sub/").contains("empty segment"));
    }

    #[test]
    fn refuses_the_empty_path() {
        assert!(refuse("").contains("empty"));
    }

    #[test]
    fn decodes_nothing_so_encoded_traversal_stays_a_literal_name() {
        // Nothing in this crate percent- or unicode-decodes a path, so
        // these are ordinary directory names, not traversal. Pinned so a
        // future decoding step has to confront this test.
        for input in ["%2e%2e/evil.md", "..%2fevil.md", "\u{ff0e}\u{ff0e}/evil.md"] {
            let joined = join_within(Path::new(ROOT), input).unwrap();
            assert!(joined.starts_with(ROOT), "{}", joined.display());
        }
    }
}
