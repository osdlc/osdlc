//! Path containment guard.
//!
//! A substring check such as `!p.contains("..")` is weak in both directions.
//! It rejects innocent names (`My ..dotfiles note.md`) and accepts hostile
//! ones: an absolute path (`/etc/passwd`), a Windows drive (`C:\`), a UNC
//! prefix, a `~` a shell would expand, a NUL byte that truncates the path in
//! any C API it reaches, or a symlink whose *target* leaves the root although
//! its spelling never says `..`.
//!
//! So the guard has two layers, and both are mandatory:
//!
//! 1. **Lexical**: [`lexical::validate_relative`] rejects the shapes above
//!    before touching the filesystem, so a hostile path costs no syscalls and
//!    the error is precise. The [`lexical`] module takes no filesystem and
//!    reads no ambient state, such as the current directory.
//! 2. **Containment**: a [`Guard`] is bound to one filesystem, through a
//!    [`Resolver`]. [`Guard::resolve`] and [`Guard::contains`] resolve
//!    symlinks in whatever part of the path exists yet and prove the result
//!    is inside the root. A dangling symlink is followed to where its target
//!    would be created. This layer catches the symlink escape, and it is why
//!    `join()` alone is never enough.
//!
//! Every entry point that accepts a path from a client must route through
//! [`Guard::resolve`]. [`Guard::std`] is the guard on the real disk. Every
//! path a guard is given must be absolute: the guard reads no current
//! directory.
//!
//! The check is a snapshot. A symlink planted or changed after
//! [`Guard::resolve`] returns is not seen. To create a file, open it with
//! `OpenOptions::new().write(true).create_new(true)`: that open fails when the
//! final component is a symlink, dangling or not. A symlink swapped into a
//! parent directory still needs a per-component no-follow open. A hard link to
//! a file outside the root is out of reach of any path check. Symlink handling
//! is tested on Unix and Windows. On Windows a `..` folds as text before any
//! link is followed, as Windows reads it.
//!
//! Some names mean a device or a stream on Windows and an ordinary file
//! elsewhere, such as `NUL` or `ab:c`. On Windows a guard refuses them. On
//! other platforms it accepts them and reports each one as a [`PathWarning`]
//! to the handler set with [`Guard::with_warning_handler`].
//! [`lexical::windows_names`] lists them on every platform. The crate never
//! writes to the console.
//!
//! ```
//! use path_guard::Guard;
//!
//! let guard = Guard::std();
//! let root = std::env::temp_dir(); // any absolute directory
//! assert!(guard.resolve(&root, "notes/a.md").is_ok());
//! assert!(guard.resolve(&root, "../etc/passwd").is_err());
//! ```

use std::io;
use std::path::{Path, PathBuf};
use std::sync::Arc;

mod guard;
pub mod lexical;

pub use guard::Guard;

/// Why a path was refused.
///
/// The variant names the first rule the path broke.
///
/// Non-exhaustive: match with a `_` arm that refuses the path, so a future
/// variant is not a breaking change. Every variant means the path was
/// refused.
///
/// # Examples
///
/// ```
/// use path_guard::{lexical, PathError};
/// assert_eq!(
///     lexical::validate_relative(".."),
///     Err(PathError::ParentSegment("..".into()))
/// );
/// ```
#[derive(Debug, thiserror::Error, PartialEq)]
#[non_exhaustive]
pub enum PathError {
    /// The path was empty, or became empty once trailing slashes were trimmed.
    #[error("path is empty")]
    Empty,
    /// The path was absolute; only root-relative paths are allowed.
    #[error("path must be relative, got absolute path {0:?}")]
    Absolute(String),
    /// The path contained a `..` parent-directory segment.
    #[error("path contains a parent-directory segment: {0:?}")]
    ParentSegment(String),
    /// The path contained an empty or `.` segment.
    #[error("path contains an empty or `.` segment: {0:?}")]
    DegenerateSegment(String),
    /// The path contained a NUL byte.
    #[error("path contains a NUL byte")]
    Nul,
    /// The path began with `~`, which a shell would expand.
    #[error("path starts with `~`, which a shell would expand: {0:?}")]
    Tilde(String),
    /// The path looked like a Windows drive or UNC path.
    #[error("path looks like a Windows drive or UNC path: {0:?}")]
    WindowsPath(String),
    /// The path was proved to resolve outside the root. Holds the input and
    /// the real root it left.
    #[error("path escapes the root: {0:?} resolves outside {1:?}")]
    Escapes(String, PathBuf),
    /// The check could not finish: the path passes through more than
    /// [`MAX_LINK_HOPS`] symlinks, such as a loop, or spends the check's
    /// resolver-call budget. Holds the input.
    #[error("path cannot be resolved: {0:?} follows too many links or spends the call budget")]
    Unresolvable(String),
    /// The root was the empty path, which would hold every path.
    #[error("root is empty")]
    EmptyRoot,
    /// [`lexical::to_relative`]: the path does not start with the root, read
    /// as text. Holds the path and the root.
    #[error("path {0:?} is not under the root {1:?}")]
    NotUnderRoot(PathBuf, PathBuf),
    /// An argument that names a place on the filesystem was relative or
    /// empty. Every such argument must be absolute.
    #[error("{argument} must be absolute, got {path:?}")]
    NotAbsolute {
        /// The parameter that was refused, as the function names it: `root`,
        /// `outer`, `inner`, `path` or `cwd`.
        argument: &'static str,
        /// The value it was given.
        path: PathBuf,
    },
    /// On Windows, a segment is a reserved device name, such as `NUL` or
    /// `com1.txt`. A [`Guard`] refuses it there. Holds the segment.
    #[error("path segment {0:?} is a reserved device name on Windows")]
    ReservedName(String),
    /// On Windows, a segment names an alternate data stream (`name:stream`).
    /// A [`Guard`] refuses it there. Holds the segment.
    #[error("path segment {0:?} names an alternate data stream on Windows")]
    AlternateStream(String),
    /// A path component was not valid UTF-8. Rust only: the TypeScript twin
    /// has no such kind.
    #[error("path is not valid UTF-8")]
    NotUtf8,
}

/// A name that is fine on this host but means something else on Windows.
///
/// [`lexical::windows_names`] returns these, and a [`Guard`] off Windows sends
/// them to its warning handler. A warning does not stop the call.
///
/// # Examples
///
/// ```
/// use path_guard::{lexical, PathWarning, PathWarningKind};
/// assert_eq!(
///     lexical::windows_names("a/NUL.txt"),
///     vec![PathWarning { kind: PathWarningKind::ReservedName, segment: "NUL.txt".into() }]
/// );
/// ```
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PathWarning {
    /// What the segment means on Windows.
    pub kind: PathWarningKind,
    /// The segment that matched, as written, after `\` has become `/`.
    pub segment: String,
}

/// The kind of a [`PathWarning`]. Each has the [`PathError`] variant of the
/// same name that a [`Guard`] returns on Windows.
///
/// Non-exhaustive: match with a `_` arm.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[non_exhaustive]
pub enum PathWarningKind {
    /// The segment's base name is a reserved device name, such as `CON`,
    /// `NUL` or `COM1`.
    ReservedName,
    /// The segment holds a `:` and its base name is not a reserved name, so
    /// on Windows it names an alternate data stream.
    AlternateStream,
}

/// The handler a [`Guard`] sends its warnings to.
type WarningHandler = Arc<dyn Fn(&PathWarning) + Send + Sync>;

/// How the containment layer canonicalises a path.
///
/// Implement this to guard paths against a filesystem other than the real one,
/// such as an in-memory tree in a test, and pass it to [`Guard::new`]. The
/// real filesystem is [`StdResolver`].
///
/// # Examples
///
/// ```
/// use path_guard::{Resolver, StdResolver};
/// // `StdResolver` is the standard, object-safe implementation.
/// let _: &dyn Resolver = &StdResolver;
/// ```
pub trait Resolver {
    /// `p` with every symlink resolved, as [`std::fs::canonicalize`] answers.
    /// Must fail when `p` does not exist. When `p` resolves, so must each of
    /// its leading parts. [`StdResolver`] meets this on Unix, and on Windows
    /// for the paths the guard asks about: there it folds `..` as text before
    /// it asks, as Windows does.
    ///
    /// # Errors
    ///
    /// Returns the resolver's I/O error when `p` cannot be resolved, which it
    /// must do when `p` does not exist.
    fn canonicalize(&self, p: &Path) -> io::Result<PathBuf>;

    /// The target text of the symlink at `p`, unresolved, as
    /// [`std::fs::read_link`] answers. Must fail when `p` is not a symlink.
    /// The guard asks only about a path whose parent canonicalised and which
    /// does not, so it can follow a dangling link to where its target lands.
    ///
    /// # Errors
    ///
    /// Returns the resolver's I/O error when `p` is not a symlink.
    fn read_link(&self, p: &Path) -> io::Result<PathBuf>;
}

/// A shared reference to a resolver is a resolver, so a [`Guard`] can borrow
/// one: `Guard::new(&fs)`.
impl<R: Resolver + ?Sized> Resolver for &R {
    fn canonicalize(&self, p: &Path) -> io::Result<PathBuf> {
        (**self).canonicalize(p)
    }

    fn read_link(&self, p: &Path) -> io::Result<PathBuf> {
        (**self).read_link(p)
    }
}

/// A resolver behind an [`Arc`] is a resolver, so guards can share one.
impl<R: Resolver + ?Sized> Resolver for Arc<R> {
    fn canonicalize(&self, p: &Path) -> io::Result<PathBuf> {
        (**self).canonicalize(p)
    }

    fn read_link(&self, p: &Path) -> io::Result<PathBuf> {
        (**self).read_link(p)
    }
}

/// The real filesystem, through [`std::fs::canonicalize`] and
/// [`std::fs::read_link`]. [`Guard::std`] is a guard over it.
///
/// # Examples
///
/// ```
/// use path_guard::{Guard, StdResolver};
/// let guard = Guard::new(StdResolver);
/// assert!(guard.resolve(&std::env::temp_dir(), "notes/a.md").is_ok());
/// ```
#[derive(Debug, Clone, Copy, Default)]
pub struct StdResolver;

impl Resolver for StdResolver {
    fn canonicalize(&self, p: &Path) -> io::Result<PathBuf> {
        std::fs::canonicalize(p)
    }

    fn read_link(&self, p: &Path) -> io::Result<PathBuf> {
        std::fs::read_link(p)
    }
}

/// How many dangling symlinks one check follows before it refuses the path,
/// as Linux's `MAXSYMLINKS`. A loop of links never reaches a target.
///
/// # Examples
///
/// ```
/// assert_eq!(path_guard::MAX_LINK_HOPS, 40);
/// ```
pub const MAX_LINK_HOPS: usize = 40;

#[cfg(test)]
mod tests;

/// Compiles and runs the code blocks in the crate README as doctests.
#[cfg(doctest)]
#[doc = include_str!("../README.md")]
struct ReadmeDoctests;
