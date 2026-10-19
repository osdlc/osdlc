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
//! 1. **Lexical**: [`validate_relative`] rejects the shapes above before
//!    touching the filesystem, so a hostile path costs no syscalls and the
//!    error is precise.
//! 2. **Containment**: [`resolve`] and [`contains`] resolve symlinks in
//!    whatever part of the path exists yet and prove the result is inside the
//!    root. A dangling symlink is followed to where its target would be
//!    created. This layer catches the symlink escape, and it is why `join()`
//!    alone is never enough.
//!
//! Every entry point that accepts a path from a client must route through
//! [`resolve`].
//!
//! The check is a snapshot. A symlink planted or changed after [`resolve`]
//! returns is not seen. To create a file, open it with
//! `OpenOptions::new().write(true).create_new(true)`: that open fails when the
//! final component is a symlink, dangling or not. A symlink swapped into a
//! parent directory still needs a per-component no-follow open. A hard link to
//! a file outside the root is out of reach of any path check. Symlink handling
//! is tested on Unix only.
//!
//! The containment layer reads the filesystem through a [`Resolver`]. The
//! plain functions use [`StdResolver`]; [`resolve_with`] and [`contains_with`]
//! take any other, such as an in-memory filesystem.

use std::io;
use std::path::{Component, Path, PathBuf};

/// Why a path was refused.
///
/// Returned by [`validate_relative`], [`resolve`] and friends. The variant
/// names the first rule the path broke.
///
/// Non-exhaustive: match with a `_` arm so a future variant is not a breaking
/// change.
///
/// # Examples
///
/// ```
/// use path_guard::{validate_relative, PathError};
/// assert_eq!(validate_relative(".."), Err(PathError::ParentSegment("..".into())));
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
    /// The path resolved outside the root. Holds the input and the root it left.
    #[error("path escapes the root: {0:?} resolves outside {1:?}")]
    Escapes(String, PathBuf),
    /// A path component was not valid UTF-8.
    #[error("path is not valid UTF-8")]
    NotUtf8,
}

/// How the containment layer canonicalises a path.
///
/// Implement this to guard paths against a filesystem other than the real one,
/// such as an in-memory tree in a test. The real filesystem is [`StdResolver`].
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
    /// its leading parts. [`StdResolver`] meets this on Unix. On Windows `..`
    /// folds as text, so a path can resolve while a leading part does not;
    /// the guard still answers correctly, because it folds any `..` the walk
    /// leaves and walks again.
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

/// The real filesystem, through [`std::fs::canonicalize`] and
/// [`std::fs::read_link`].
///
/// # Examples
///
/// ```
/// use path_guard::{resolve_with, StdResolver};
/// use std::path::Path;
/// assert!(resolve_with(&StdResolver, Path::new("/srv/data"), "notes/a.md").is_ok());
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

/// Layer 1: lexical validation of a root-relative path.
///
/// Returns the normalised form (backslashes folded to `/`, no trailing
/// slash). Does not touch the filesystem, so it is cheap enough to call on
/// every element of a large request.
///
/// # Errors
///
/// Returns a [`PathError`] naming the first rule the path breaks: empty, a
/// NUL byte, a leading `~`, a Windows drive or UNC prefix, an absolute path,
/// or a `.`, `..` or empty segment.
///
/// # Examples
///
/// ```
/// use path_guard::validate_relative;
/// assert_eq!(validate_relative("notes/a.md").unwrap(), "notes/a.md");
/// assert!(validate_relative("../secret").is_err());
/// ```
pub fn validate_relative(raw: &str) -> Result<String, PathError> {
    if raw.is_empty() {
        return Err(PathError::Empty);
    }
    if raw.contains('\0') {
        return Err(PathError::Nul);
    }
    if raw.starts_with('~') {
        return Err(PathError::Tilde(raw.to_string()));
    }
    // `C:\x`, `C:/x`, and UNC `\\server\share`.
    let b = raw.as_bytes();
    if b.len() >= 2 && b[1] == b':' && b[0].is_ascii_alphabetic() {
        return Err(PathError::WindowsPath(raw.to_string()));
    }
    if raw.starts_with("\\\\") {
        return Err(PathError::WindowsPath(raw.to_string()));
    }

    let unified = raw.replace('\\', "/");
    if unified.starts_with('/') {
        return Err(PathError::Absolute(raw.to_string()));
    }

    let trimmed = unified.trim_end_matches('/');
    if trimmed.is_empty() {
        return Err(PathError::Empty);
    }
    for seg in trimmed.split('/') {
        match seg {
            "" | "." => return Err(PathError::DegenerateSegment(raw.to_string())),
            ".." => return Err(PathError::ParentSegment(raw.to_string())),
            _ => {}
        }
    }
    Ok(trimmed.to_string())
}

/// Layers 1 + 2 on the real filesystem: [`resolve_with`] over [`StdResolver`].
///
/// # Errors
///
/// Returns a [`PathError`] if `raw` fails lexical validation, or
/// [`PathError::Escapes`] if the resolved path leaves `root`.
///
/// # Examples
///
/// ```
/// use path_guard::resolve;
/// use std::path::Path;
/// let root = Path::new("/srv/data");
/// assert!(resolve(root, "notes/a.md").is_ok());
/// assert!(resolve(root, "../etc/passwd").is_err());
/// ```
pub fn resolve(root: &Path, raw: &str) -> Result<PathBuf, PathError> {
    resolve_with(&StdResolver, root, raw)
}

/// Layers 1 + 2: validate, join onto `root`, and prove containment.
///
/// Neither the path nor the root need exist: each is checked by the realpath
/// of its deepest existing ancestor, which is what lets a create-new-file call
/// use the same guard as a read. A dangling symlink on the path is checked by
/// where its target would land. A chain of more than [`MAX_LINK_HOPS`] links
/// is refused, as is a root that reduces to the empty path (`""`, or a
/// relative `missing/..`) and a path whose check would spend more resolver
/// calls than its length allows.
///
/// # Errors
///
/// Returns a [`PathError`] if `raw` fails lexical validation, or
/// [`PathError::Escapes`] if the resolved path leaves `root`, if the walk
/// follows more than [`MAX_LINK_HOPS`] links, or if it spends its
/// resolver-call budget.
///
/// # Examples
///
/// ```
/// use path_guard::{resolve_with, StdResolver};
/// use std::path::Path;
/// let root = Path::new("/srv/data");
/// assert!(resolve_with(&StdResolver, root, "notes/a.md").is_ok());
/// assert!(resolve_with(&StdResolver, root, "../escape").is_err());
/// ```
pub fn resolve_with<R: Resolver + ?Sized>(
    resolver: &R,
    root: &Path,
    raw: &str,
) -> Result<PathBuf, PathError> {
    let rel = validate_relative(raw)?;
    let joined = root.join(&rel);
    let real_root = existing_prefix(resolver, root).unwrap_or_else(|| root.to_path_buf());
    match existing_prefix(resolver, &joined) {
        // An empty root would hold every path.
        Some(real) if !real_root.as_os_str().is_empty() && real.starts_with(&real_root) => {
            Ok(joined)
        }
        _ => Err(PathError::Escapes(raw.to_string(), real_root)),
    }
}

/// Canonicalise as much of `p` as exists, keeping the rest lexically.
///
/// `std::fs::canonicalize` fails outright on a missing path, which would
/// make every "write a new file" call unguardable. Walking up to the deepest
/// existing ancestor keeps the symlink resolution that matters (an attacker
/// can only plant symlinks in directories that exist) without that failure.
///
/// A `..` is resolved PHYSICALLY: it means the parent of the directory it
/// sits in, as the kernel reads it, not the name written before it. With
/// `x/link -> v/deep`, `x/link/../y` materialises at `v/y`, inside `v`, and a
/// textual fold would answer `x/y`.
///
/// The filesystem resolves a `..` only while everything before it exists.
/// Behind a missing name the walk stops, and the answer is the real path of
/// the existing part plus the rest as written. A `..` there is folded against
/// that real path, never against the spelling: the missing names are new
/// directories, so a `..` removes one, and a `..` past them reaches the
/// parent of a real path. Once the fold is back on a directory that exists,
/// what follows may be a symlink again, so the walk resumes there. With
/// `elsewhere/link -> v/deep/deeper`, `elsewhere/link/missing/../..` is
/// `v/deep`, which is where `create_dir_all` puts it.
///
/// The first missing component may be a dangling symlink, which
/// `canonicalize` fails on just as on a missing name. A write through it
/// lands at its target, so the walk reads the link and continues from the
/// target, resolved against the link's directory when relative. A chain of
/// more than [`MAX_LINK_HOPS`] links, such as a loop, leaves `p` as written,
/// as does a walk that would spend more resolver calls than a fixed
/// allowance per link plus a few per component of `p`.
///
/// Public so a caller that reduces a path for its own comparison uses this
/// copy rather than writing a second one.
///
/// # Examples
///
/// ```
/// use path_guard::canonical_existing_prefix;
/// use std::path::Path;
/// // The existing prefix is canonicalised; the missing tail is kept as written.
/// let p = canonical_existing_prefix(Path::new("/srv/data/notes/a.md"));
/// assert!(p.ends_with("notes/a.md"));
/// ```
pub fn canonical_existing_prefix(p: &Path) -> PathBuf {
    existing_prefix(&StdResolver, p).unwrap_or_else(|| p.to_path_buf())
}

// Resolver calls one check may spend: an allowance for each link it may
// follow, plus a few for each component of the path. A check that needs more
// is refused. Each hop costs calls in proportion to its link's target, so
// without the cap a loop of long targets would multiply them by
// `MAX_LINK_HOPS`.

/// Calls per link. A hop the kernel can follow costs one whole-path probe,
/// about 2·log2(components) search probes and one `read_link`: about 25 at
/// `PATH_MAX`.
const CALLS_PER_HOP: usize = 32;
/// Calls per path component. A `..` behind a missing name costs a probe and a
/// `read_link`: 2 calls against the 8 its two components allow.
const CALLS_PER_PART: usize = 4;

/// [`canonical_existing_prefix`] over any [`Resolver`]. `None` when the walk
/// follows more than [`MAX_LINK_HOPS`] links or spends its resolver calls.
/// The answer holds no `..`.
fn existing_prefix<R: Resolver + ?Sized>(resolver: &R, p: &Path) -> Option<PathBuf> {
    let left = CALLS_PER_HOP * (MAX_LINK_HOPS + 1) + CALLS_PER_PART * p.components().count();
    walk(&mut Calls { resolver, left }, p, 0)
}

/// A [`Resolver`] with a number of calls left. Each method answers `None`
/// once they are spent.
struct Calls<'r, R: ?Sized> {
    resolver: &'r R,
    left: usize,
}

impl<R: Resolver + ?Sized> Calls<'_, R> {
    fn canonicalize(&mut self, p: &Path) -> Option<io::Result<PathBuf>> {
        self.left = self.left.checked_sub(1)?;
        Some(self.resolver.canonicalize(p))
    }

    fn read_link(&mut self, p: &Path) -> Option<io::Result<PathBuf>> {
        self.left = self.left.checked_sub(1)?;
        Some(self.resolver.read_link(p))
    }
}

/// [`existing_prefix`] of `p`, reached after `hops` links.
fn walk<R: Resolver + ?Sized>(calls: &mut Calls<R>, p: &Path, hops: usize) -> Option<PathBuf> {
    let parts: Vec<Component> = p.components().collect();
    let last_dotdot = parts.iter().rposition(|c| *c == Component::ParentDir);
    // `base` stands for `parts[..i]`: their real path once `real`, else as written.
    let (mut base, mut real, mut i) = (PathBuf::new(), false, 0);
    loop {
        let (n, found) = deepest_existing(calls, &base, &parts[i..], i == 0)?;
        if let Some(found) = found {
            (base, real) = (found, true);
        }
        i += n;
        // Nested `if let` rather than a `let`-chain, so the crate builds on the
        // workspace MSRV (1.85); `let`-chains need 1.88. The `?` still runs only
        // once `real` holds and the component is `Normal`, so the resolver-call
        // budget is spent exactly as the single condition would spend it.
        if real
            && let Some(Component::Normal(name)) = parts.get(i)
            && let Ok(target) = calls.read_link(&base.join(name))?
        {
            if hops == MAX_LINK_HOPS {
                return None;
            }
            // `join` with an absolute target replaces `base`, as the kernel does.
            let mut next = base.join(target);
            next.extend(&parts[i + 1..]);
            return walk(calls, &next, hops + 1);
        }
        if last_dotdot.is_none_or(|d| d < i) {
            base.extend(&parts[i..]);
            return Some(base);
        }
        // Fold the rest against `base` up to the first `..` that lands on a
        // directory that exists, or that nothing is known to: a symlink may
        // follow there, so the walk resumes.
        let mut missing = 0_usize;
        loop {
            let Some(part) = parts.get(i) else {
                return Some(base);
            };
            i += 1;
            match part {
                Component::CurDir => {}
                Component::ParentDir => {
                    base.pop();
                    missing = missing.saturating_sub(1);
                    if missing == 0 {
                        break;
                    }
                }
                Component::Normal(_) => {
                    missing += 1;
                    base.push(part);
                }
                _ => base.push(part),
            }
        }
    }
}

/// How many leading `rest` canonicalise when joined to `base`, and the real
/// path they reach (`None` when none do). `whole` probes all of `rest`
/// first. `None` once the calls are spent.
///
/// A leading part that canonicalises has every shorter one canonicalising
/// too, so the search steps 1, 2, 4, ... past the last part that resolved and
/// then bisects. That costs O(log d) calls for a missing part `d` past
/// `base`, plus the probe of the whole path when `whole`.
fn deepest_existing<R: Resolver + ?Sized>(
    calls: &mut Calls<R>,
    base: &Path,
    rest: &[Component],
    whole: bool,
) -> Option<(usize, Option<PathBuf>)> {
    let mut probe = |n: usize| {
        let mut q = base.to_path_buf();
        q.extend(&rest[..n]);
        calls.canonicalize(&q)
    };
    // Nested `if let` rather than a `let`-chain (MSRV 1.85; see `walk`).
    if whole && let Ok(r) = probe(rest.len())? {
        return Some((rest.len(), Some(r)));
    }
    // Invariant: `rest[..found]` canonicalises (to `real` once `found > 0`);
    // `rest[..missing]` does not, or lies past the end.
    let (mut found, mut real) = (0, None);
    let (mut missing, mut step) = (rest.len() + usize::from(!whole), 1);
    while found + step < missing {
        match probe(found + step)? {
            Ok(r) => (found, real, step) = (found + step, Some(r), step * 2),
            Err(_) => missing = found + step,
        }
    }
    while missing - found > 1 {
        let mid = (found + missing) / 2;
        match probe(mid)? {
            Ok(r) => (found, real) = (mid, Some(r)),
            Err(_) => missing = mid,
        }
    }
    Some((found, real))
}

/// [`contains_with`] on the real filesystem, over [`StdResolver`].
///
/// # Examples
///
/// ```
/// use path_guard::contains;
/// use std::path::Path;
/// let root = Path::new("/srv/data");
/// assert!(contains(root, Path::new("/srv/data/notes")));
/// assert!(!contains(root, Path::new("/srv/other")));
/// ```
pub fn contains(outer: &Path, inner: &Path) -> bool {
    contains_with(&StdResolver, outer, inner)
}

/// Is `inner` the same directory as `outer`, or beneath it — both measured
/// after [`canonical_existing_prefix`] has resolved them? `false` when either
/// passes through more than [`MAX_LINK_HOPS`] symlinks or spends its resolver
/// calls, and when `outer` reduces to the empty path.
///
/// `Path::starts_with` on raw spellings answers the wrong question: on macOS a
/// temporary directory is handed out as `/var/…` and canonicalises to
/// `/private/var/…`, so a path genuinely inside the root compares unequal.
/// `starts_with` itself is component-wise, so a sibling named `/vault-bee`
/// never matches a root of `/vault-b`.
///
/// # Examples
///
/// ```
/// use path_guard::{contains_with, StdResolver};
/// use std::path::Path;
/// assert!(contains_with(&StdResolver, Path::new("/srv/data"), Path::new("/srv/data/sub")));
/// ```
pub fn contains_with<R: Resolver + ?Sized>(resolver: &R, outer: &Path, inner: &Path) -> bool {
    match (
        existing_prefix(resolver, outer),
        existing_prefix(resolver, inner),
    ) {
        // An empty outer would hold every path.
        (Some(outer), Some(inner)) => !outer.as_os_str().is_empty() && inner.starts_with(&outer),
        _ => false,
    }
}

/// `path` made absolute against the process's current directory and folded
/// textually: `.` dropped, `..` removed together with the component before it,
/// no trailing slash. Like Node's `path.resolve`.
///
/// This is a lexical fold, not a containment check. It touches no filesystem,
/// follows no symlink, and so cannot tell whether the result stays inside any
/// root. Use [`resolve`] for that. A `..` at the root stays at the root, and a
/// leading `..` in a relative path pops the last component of the current
/// directory.
///
/// # Errors
///
/// The current directory cannot be read and `path` is relative. An absolute
/// `path` never fails.
pub fn lexical_absolute(path: &Path) -> io::Result<PathBuf> {
    let joined = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()?.join(path)
    };
    let mut out = PathBuf::new();
    for part in joined.components() {
        match part {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    Ok(out)
}

/// Turn an absolute path back into a root-relative one (`/v/Notes/a.md` ->
/// `Notes/a.md`), with `/` separators regardless of platform.
///
/// # Errors
///
/// Returns [`PathError::Escapes`] if `abs` is not under `root`,
/// [`PathError::ParentSegment`] if the relative path holds a `..`, and
/// [`PathError::NotUtf8`] if a component is not valid UTF-8.
///
/// # Examples
///
/// ```
/// use path_guard::to_relative;
/// use std::path::Path;
/// let rel = to_relative(Path::new("/v"), Path::new("/v/Notes/a.md")).unwrap();
/// assert_eq!(rel, "Notes/a.md");
/// assert!(to_relative(Path::new("/v"), Path::new("/other/a.md")).is_err());
/// ```
pub fn to_relative(root: &Path, abs: &Path) -> Result<String, PathError> {
    let rel = abs
        .strip_prefix(root)
        .map_err(|_| PathError::Escapes(abs.to_string_lossy().into_owned(), root.to_path_buf()))?;
    let mut parts = Vec::new();
    for c in rel.components() {
        match c {
            Component::Normal(s) => parts.push(s.to_str().ok_or(PathError::NotUtf8)?.to_string()),
            Component::CurDir => {}
            _ => return Err(PathError::ParentSegment(rel.to_string_lossy().into_owned())),
        }
    }
    Ok(parts.join("/"))
}

#[cfg(test)]
mod tests;

/// Compiles and runs the code blocks in the crate README as doctests.
#[cfg(doctest)]
#[doc = include_str!("../README.md")]
struct ReadmeDoctests;
