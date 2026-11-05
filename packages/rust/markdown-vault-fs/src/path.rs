//! Vault-relative paths: the containment guard and the `_system/` rules.
//!
//! The guard lives in the `path-guard` crate. [`Guard`], [`PathError`],
//! [`Resolver`] and the text checks in [`lexical`] are re-exported here, so a
//! vault caller needs one dependency. [`guard`] is a guard over a [`Vfs`], for
//! code that reads the vault through one.

use std::io;
use std::path::{Path, PathBuf};

pub use path_guard::{Guard, PathError, Resolver, lexical};
use vfs_seam::Vfs;

/// A [`Resolver`] that asks a [`Vfs`]: links resolve through
/// [`Vfs::canonicalize`] and [`Vfs::read_link`], and a path that is not there
/// fails, as the resolver contract requires. Over a host with no links (an
/// in-memory tree) the containment check is lexical.
#[derive(Clone, Copy)]
pub struct VfsResolver<'a>(pub &'a dyn Vfs);

impl std::fmt::Debug for VfsResolver<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_tuple("VfsResolver").finish_non_exhaustive()
    }
}

impl Resolver for VfsResolver<'_> {
    fn canonicalize(&self, p: &Path) -> io::Result<PathBuf> {
        if !self.0.exists(p) {
            return Err(io::Error::new(
                io::ErrorKind::NotFound,
                "no such file or directory",
            ));
        }
        self.0
            .canonicalize(p)
            .map_err(vfs_seam::VfsError::into_io_error)
    }

    fn read_link(&self, p: &Path) -> io::Result<PathBuf> {
        self.0
            .read_link(p)
            .map_err(vfs_seam::VfsError::into_io_error)
    }
}

/// The containment guard over `vfs`.
pub fn guard(vfs: &dyn Vfs) -> Guard<VfsResolver<'_>> {
    Guard::new(VfsResolver(vfs))
}

/// The `_system/` prefix, as a policy rather than as a string literal.
///
/// A vault-relative path is spelled with `/` (see [`lexical::validate_relative`], which
/// folds backslashes) and the prefix is eight bytes long including that
/// separator — the constant is here so no consumer has to know either fact.
pub const SYSTEM_PREFIX: &str = "_system/";

/// Whether `rel` is under `_system/` — **case-insensitively**.
///
/// # The one predicate for the policy
///
/// `_system/**` is where the notes that carry a contract live, and
/// two kinds of caller enforce that: a writer runs corpus validation on a
/// write there, and a rename planner (such as `markdown-relink`) refuses a
/// rename that crosses the boundary in either direction. Those are the same policy and they now
/// ask the same function.
///
/// It lives here because this is the lowest crate both enforcers can depend on,
/// so it is where the single copy has to sit.
///
/// # Why case-insensitive
///
/// The prefix is a proxy for "this file is a config note", and on the two
/// filesystems most users run on it is a case-insensitive one:
/// `_System/ocr.md` and `_system/ocr.md` are the same file on macOS and on
/// Windows. A case-sensitive check lets a write — or a *rename*, which is a
/// write with a longer reach — land content in that file with the corpus
/// validation skipped. Matching case-insensitively costs a Linux vault
/// nothing: a genuinely distinct `_System/` directory there is treated as
/// configuration too, which is the conservative direction to be wrong in.
pub fn is_system_path(rel: &str) -> bool {
    rel.as_bytes()
        .get(..SYSTEM_PREFIX.len())
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case(SYSTEM_PREFIX.as_bytes()))
}

/// `rel` with its `_system/` prefix in canonical lower case, or `None` when it
/// is not a `_system/` path at all.
///
/// The corpus routes on the path string, so recognising `_System/…` as
/// configuration is only half the fix: handed through as typed it matches no
/// contract, and "no contract matches this path" is an *advisory*
/// result, which lets the write through. Canonicalising the prefix is what makes the same file
/// reach the same contract under either spelling. Only the prefix is touched —
/// the rest of the path is the corpus's business and a note's own name is
/// case-sensitive data.
pub fn system_route(rel: &str) -> Option<String> {
    is_system_path(rel).then(|| format!("{SYSTEM_PREFIX}{}", &rel[SYSTEM_PREFIX.len()..]))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_system_prefix_is_matched_case_insensitively() {
        // The whole reason one predicate serves every guard: on macOS and
        // Windows `_System/x.md` IS `_system/x.md`, so any spelling of it has
        // to answer the same wherever it is asked.
        assert!(is_system_path("_system/ocr.md"));
        assert!(is_system_path("_System/ocr.md"));
        assert!(is_system_path("_SYSTEM/ocr.md"));
        assert!(is_system_path("_SyStEm/scheduled_tasks/nightly.md"));
    }

    #[test]
    fn only_the_prefix_counts_as_system() {
        assert!(!is_system_path("_systemic/x.md"));
        assert!(!is_system_path("Notes/_system/x.md"));
        assert!(!is_system_path("_system"), "the separator is part of it");
        assert!(!is_system_path(""));
    }

    #[cfg(unix)]
    #[test]
    fn the_vfs_guard_keeps_paths_inside_the_vault() {
        let vfs = vfs_seam::MemVfs::new();
        vfs.insert("/v/Notes/a.md", "x").unwrap();
        let g = guard(&vfs);
        assert_eq!(
            g.resolve(Path::new("/v"), "Notes/a.md").unwrap(),
            Path::new("/v/Notes/a.md")
        );
        // Not there yet is fine: a rename destination.
        assert!(g.resolve(Path::new("/v"), "Notes/new.md").is_ok());
        assert!(g.resolve(Path::new("/v"), "../etc/passwd").is_err());
    }

    #[test]
    fn the_route_canonicalises_the_prefix_and_nothing_else() {
        // The corpus routes on the string, so a mis-cased prefix has to reach
        // the same contract — while the note's own name stays case-sensitive
        // data.
        assert_eq!(
            system_route("_System/Scheduled_Tasks/Nightly.md").as_deref(),
            Some("_system/Scheduled_Tasks/Nightly.md")
        );
        assert_eq!(system_route("Notes/a.md"), None);
    }
}
