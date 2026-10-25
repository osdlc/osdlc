//! [`Guard`]: the containment checks, bound to one filesystem.

use std::fmt;
use std::io;
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;

use crate::{
    MAX_LINK_HOPS, PathError, PathWarning, PathWarningKind, Resolver, StdResolver, WarningHandler,
    lexical,
};

/// The containment checks, bound to one filesystem through a [`Resolver`].
///
/// [`Guard::std`] is the guard on the real disk. [`Guard::new`] takes any
/// other resolver, such as an in-memory filesystem in a test. The call site
/// names its guard, so a reader can see which filesystem it uses.
///
/// Every path a guard is given must be absolute, as [`Path::is_absolute`]
/// reads it: on Windows that is a drive or share and a root, such as `C:\v`.
/// The guard reads no current directory. Join it yourself first.
///
/// The guard knows its platform. On Windows it refuses a segment that is a
/// device name or an alternate data stream ([`PathError::ReservedName`],
/// [`PathError::AlternateStream`]). Elsewhere it accepts them and, when the
/// path is accepted, sends each as a [`PathWarning`] to the handler set with
/// [`Guard::with_warning_handler`]. With no handler, nothing is reported.
///
/// `Guard` is `Clone`, `Send` and `Sync` when its resolver is.
///
/// # Examples
///
/// ```
/// use path_guard::Guard;
/// let guard = Guard::std();
/// let root = std::env::temp_dir().join("data"); // any absolute directory
/// assert!(guard.resolve(&root, "notes/a.md").is_ok());
/// assert!(guard.resolve(&root, "../etc/passwd").is_err());
/// assert_eq!(guard.contains(&root, &root.with_file_name("other")), Ok(false));
/// ```
#[derive(Clone)]
pub struct Guard<R: Resolver> {
    resolver: R,
    on_warning: Option<WarningHandler>,
}

impl<R: Resolver + fmt::Debug> fmt::Debug for Guard<R> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Guard")
            .field("resolver", &self.resolver)
            .field("on_warning", &self.on_warning.is_some())
            .finish()
    }
}

impl Guard<StdResolver> {
    /// The guard on the real disk, over [`StdResolver`].
    ///
    /// # Examples
    ///
    /// ```
    /// use path_guard::Guard;
    /// assert!(Guard::std().resolve(&std::env::temp_dir(), "a.md").is_ok());
    /// ```
    #[must_use]
    pub fn std() -> Self {
        Self::new(StdResolver)
    }
}

impl<R: Resolver> Guard<R> {
    /// A guard over `resolver`, with no warning handler.
    ///
    /// # Examples
    ///
    /// ```
    /// use path_guard::{Guard, StdResolver};
    /// let guard = Guard::new(StdResolver);
    /// # let _ = guard;
    /// ```
    #[must_use]
    pub fn new(resolver: R) -> Self {
        Self {
            resolver,
            on_warning: None,
        }
    }

    /// This guard, sending each [`PathWarning`] to `handler`.
    ///
    /// Off Windows, [`Guard::resolve`] calls `handler` once per device name or
    /// stream in a path it accepts, in segment order. On Windows the guard
    /// refuses such a path and never calls `handler`.
    ///
    /// # Examples
    ///
    /// ```
    /// use path_guard::{Guard, PathWarningKind};
    /// use std::sync::{Arc, Mutex};
    ///
    /// let seen = Arc::new(Mutex::new(Vec::new()));
    /// let log = Arc::clone(&seen);
    /// let guard = Guard::std().with_warning_handler(move |w| log.lock().unwrap().push(w.kind));
    /// let got = guard.resolve(&std::env::temp_dir(), "NUL.txt");
    /// if cfg!(windows) {
    ///     assert!(got.is_err());
    /// } else {
    ///     assert!(got.is_ok());
    ///     assert_eq!(*seen.lock().unwrap(), [PathWarningKind::ReservedName]);
    /// }
    /// ```
    #[must_use]
    pub fn with_warning_handler(
        mut self,
        handler: impl Fn(&PathWarning) + Send + Sync + 'static,
    ) -> Self {
        self.on_warning = Some(Arc::new(handler));
        self
    }

    /// Validate `raw`, join it onto `root`, and prove the result stays inside.
    ///
    /// `raw` must pass [`lexical::validate_relative`]. Neither the path nor the
    /// root need exist: each is checked by the real path of its deepest
    /// existing ancestor, which is what lets a create-new-file call use the
    /// same guard as a read. A dangling symlink on the path is checked by
    /// where its target would land. Returns `root` joined with the normalised
    /// `raw`, as written, not its real path.
    ///
    /// # Errors
    ///
    /// In this order: [`PathError::EmptyRoot`] for an empty `root`, and
    /// [`PathError::NotAbsolute`] for a relative one. The
    /// [`lexical::validate_relative`] error for `raw`. On Windows,
    /// [`PathError::ReservedName`] or [`PathError::AlternateStream`] for the
    /// first such segment, before the filesystem is read. Then
    /// [`PathError::Unresolvable`] if the walk follows more than
    /// [`MAX_LINK_HOPS`] links or spends its resolver-call budget, and
    /// [`PathError::Escapes`] if the resolved path leaves `root`.
    ///
    /// # Examples
    ///
    /// ```
    /// use path_guard::{Guard, PathError};
    /// use std::path::Path;
    /// let guard = Guard::std();
    /// let root = std::env::temp_dir();
    /// assert_eq!(guard.resolve(&root, "notes/a.md").unwrap(), root.join("notes/a.md"));
    /// assert!(matches!(guard.resolve(&root, "../escape"), Err(PathError::ParentSegment(_))));
    /// assert!(matches!(
    ///     guard.resolve(Path::new("srv"), "a.md"),
    ///     Err(PathError::NotAbsolute { argument: "root", .. })
    /// ));
    /// ```
    pub fn resolve(&self, root: &Path, raw: &str) -> Result<PathBuf, PathError> {
        check_root(root, "root")?;
        let rel = lexical::validate_relative(raw)?;
        let warnings = refuse_windows_names(&rel, cfg!(windows))?;
        let joined = root.join(&rel);
        let unresolvable = || PathError::Unresolvable(raw.to_string());
        let real_root = existing_prefix(&self.resolver, root).ok_or_else(unresolvable)?;
        let real = existing_prefix(&self.resolver, &joined).ok_or_else(unresolvable)?;
        // A real root that is not absolute, such as the empty path
        // `existing_prefix` answers for a broken resolver, would hold every
        // path.
        if !is_absolute(&real_root) || !real.starts_with(&real_root) {
            return Err(PathError::Escapes(raw.to_string(), real_root));
        }
        if let Some(handler) = &self.on_warning {
            warnings.iter().for_each(|w| handler(w));
        }
        Ok(joined)
    }

    /// Is `inner` the same directory as `outer`, or beneath it, both measured
    /// by [`Guard::real_path`]'s walk?
    ///
    /// `false` also means "cannot prove": when either path passes through more
    /// than [`MAX_LINK_HOPS`] symlinks or spends its resolver calls.
    ///
    /// `Path::starts_with` on raw spellings answers the wrong question: on
    /// macOS a temporary directory is handed out as `/var/…` and canonicalises
    /// to `/private/var/…`, so a path inside the root compares
    /// unequal. `starts_with` itself is component-wise, so a sibling named
    /// `/vault-bee` never matches a root of `/vault-b`.
    ///
    /// # Errors
    ///
    /// [`PathError::EmptyRoot`] for an empty `outer`, then
    /// [`PathError::NotAbsolute`] for a relative `outer` or `inner`, an empty
    /// `inner` included.
    ///
    /// # Examples
    ///
    /// ```
    /// use path_guard::Guard;
    /// let guard = Guard::std();
    /// let root = std::env::temp_dir().join("data");
    /// assert_eq!(guard.contains(&root, &root.join("sub")), Ok(true));
    /// assert_eq!(guard.contains(&root, &root.with_file_name("other")), Ok(false));
    /// ```
    pub fn contains(&self, outer: &Path, inner: &Path) -> Result<bool, PathError> {
        check_root(outer, "outer")?;
        check_absolute(inner, "inner")?;
        Ok(
            match (
                existing_prefix(&self.resolver, outer),
                existing_prefix(&self.resolver, inner),
            ) {
                // As in `resolve`, a real `outer` that is not absolute holds
                // nothing.
                (Some(outer), Some(inner)) => is_absolute(&outer) && inner.starts_with(&outer),
                _ => false,
            },
        )
    }

    /// The real path of as much of `path` as exists, with the rest kept as
    /// written and folded. The answer never holds a `..`. A missing path is
    /// not an error.
    ///
    /// `std::fs::canonicalize` fails outright on a missing path. Walking up to
    /// the deepest existing ancestor keeps the symlink resolution that matters
    /// (an attacker can only plant symlinks in directories that exist) without
    /// that failure. A dangling symlink is followed to where its target would
    /// be created.
    ///
    /// On Unix a `..` is resolved physically: it means the parent of the
    /// directory it sits in, as the kernel reads it. With `x/link -> v/deep`,
    /// `x/link/../y` is `v/y`. On Windows a `..` folds as text before any link
    /// is followed, as Windows reads it, so there it is `x/y`. Behind a
    /// missing name, a `..` folds against the real path of the existing part.
    ///
    /// When the walk gives up, after more than [`MAX_LINK_HOPS`] links or
    /// when its resolver calls are spent, the answer is `path` with `.` and
    /// `..` folded as text.
    ///
    /// # Errors
    ///
    /// [`PathError::NotAbsolute`] when `path` is relative or empty. That is
    /// the only error.
    ///
    /// # Examples
    ///
    /// ```
    /// use path_guard::Guard;
    /// // The existing part is resolved; the missing tail is kept as written.
    /// let missing = std::env::temp_dir().join("no-such-dir/notes/a.md");
    /// let p = Guard::std().real_path(&missing).unwrap();
    /// assert!(p.ends_with("notes/a.md"));
    /// ```
    pub fn real_path(&self, path: &Path) -> Result<PathBuf, PathError> {
        check_absolute(path, "path")?;
        Ok(existing_prefix(&self.resolver, path)
            .filter(|real| is_absolute(real))
            .unwrap_or_else(|| fold_text(path)))
    }
}

/// [`PathError::EmptyRoot`] for an empty root, [`PathError::NotAbsolute`] for
/// a relative one.
/// `argument` names the parameter in the error.
fn check_root(root: &Path, argument: &'static str) -> Result<(), PathError> {
    if root.as_os_str().is_empty() {
        return Err(PathError::EmptyRoot { argument });
    }
    check_absolute(root, argument)
}

/// Is `p` absolute?
///
/// `Path::is_absolute` is always false on a target with neither Unix nor
/// Windows paths, such as `wasm32-unknown-unknown`, because no path there has a
/// prefix. A rooted path is the absolute form on such a target. A host that
/// runs the guard there supplies the filesystem, and its paths are `/`-rooted.
fn is_absolute(p: &Path) -> bool {
    p.is_absolute() || (cfg!(not(any(unix, windows, target_os = "wasi"))) && p.has_root())
}

/// [`PathError::NotAbsolute`] unless `p` is absolute.
fn check_absolute(p: &Path, argument: &'static str) -> Result<(), PathError> {
    if is_absolute(p) {
        Ok(())
    } else {
        Err(PathError::NotAbsolute {
            argument,
            path: p.to_path_buf(),
        })
    }
}

/// The device names and streams in `rel`, a path
/// [`lexical::validate_relative`] has accepted. On Windows (`windows`) the
/// first is an error instead.
pub(crate) fn refuse_windows_names(
    rel: &str,
    windows: bool,
) -> Result<Vec<PathWarning>, PathError> {
    let warnings = lexical::names_in(rel);
    match warnings.first() {
        Some(w) if windows => Err(match w.kind {
            PathWarningKind::ReservedName => PathError::ReservedName(w.segment.clone()),
            PathWarningKind::AlternateStream => PathError::AlternateStream(w.segment.clone()),
        }),
        _ => Ok(warnings),
    }
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

/// The real path of as much of `p` as exists, as [`Guard::real_path`]
/// describes. `None` when the walk follows more than [`MAX_LINK_HOPS`] links
/// or spends its resolver calls. The answer holds no `..`.
///
/// When the resolver answers any path that is not absolute and canonical,
/// such as `""` or `/v/../etc`, the answer is the empty path. It is not
/// absolute, so the guard trusts nothing about it: `resolve` refuses it as
/// an escape, `contains` answers false and `real_path` folds the input as
/// text instead.
pub(crate) fn existing_prefix<R: Resolver + ?Sized>(resolver: &R, p: &Path) -> Option<PathBuf> {
    let left = CALLS_PER_HOP * (MAX_LINK_HOPS + 1) + CALLS_PER_PART * p.components().count();
    let mut calls = Calls {
        resolver,
        left,
        untrusted: false,
    };
    let real = walk(&mut calls, p, 0)?;
    Some(if calls.untrusted {
        PathBuf::new()
    } else {
        real
    })
}

/// Is `p` a real path as [`Resolver::canonicalize`] must answer one: absolute,
/// with no `.` or `..` component?
///
/// Read from the text: `Path::components` drops a `.` in the middle of a path,
/// so `/v/./x` would pass. A Windows prefix is skipped, so `\\.\COM1` and
/// `\\?\C:\` still pass.
pub(crate) fn canonical(p: &Path) -> bool {
    if !is_absolute(p) {
        return false;
    }
    let text = p.as_os_str().as_encoded_bytes();
    let rest = match p.components().next() {
        Some(Component::Prefix(prefix)) => &text[prefix.as_os_str().len()..],
        _ => text,
    };
    rest.split(|&b| b == b'/' || (cfg!(windows) && b == b'\\'))
        .all(|seg| seg != b"." && seg != b"..")
}

/// A [`Resolver`] with a number of calls left. Each method answers `None`
/// once they are spent.
struct Calls<'r, R: ?Sized> {
    resolver: &'r R,
    left: usize,
    /// Set once the resolver answers a path that is not [`canonical`].
    untrusted: bool,
}

impl<R: Resolver + ?Sized> Calls<'_, R> {
    fn canonicalize(&mut self, p: &Path) -> Option<io::Result<PathBuf>> {
        self.left = self.left.checked_sub(1)?;
        let answer = self.resolver.canonicalize(p);
        if answer.as_ref().is_ok_and(|real| !canonical(real)) {
            self.untrusted = true;
        }
        Some(answer)
    }

    fn read_link(&mut self, p: &Path) -> Option<io::Result<PathBuf>> {
        self.left = self.left.checked_sub(1)?;
        Some(self.resolver.read_link(p))
    }
}

/// [`existing_prefix`] of `p`, reached after `hops` links. On Windows `p` is
/// folded as text first, as Windows reads it, so a `..` is never resolved
/// against a link's target there.
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
/// target, resolved against the link's directory when relative.
fn walk<R: Resolver + ?Sized>(calls: &mut Calls<R>, p: &Path, hops: usize) -> Option<PathBuf> {
    #[cfg(windows)]
    let folded = fold_text(p);
    #[cfg(windows)]
    let p = folded.as_path();
    let parts: Vec<Component> = p.components().collect();
    let last_dotdot = parts.iter().rposition(|c| *c == Component::ParentDir);
    // A Windows drive or share and the separator after it are one root. The
    // prefix alone is never probed: `\\?\C:`, the form `canonicalize` returns
    // and so the form a path takes after a link, names the volume and does
    // not canonicalise. A bare drive `C:` is its working directory, so it is.
    let lead = match parts.as_slice() {
        [Component::Prefix(_), Component::RootDir, ..] => 2,
        _ => 0,
    };
    // `base` stands for `parts[..i]`: their real path once `real`, else as written.
    let (mut base, mut real, mut i) = (parts[..lead].iter().collect::<PathBuf>(), false, lead);
    loop {
        let (n, found) = deepest_existing(calls, &base, &parts[i..], i == lead)?;
        // The root kept as one part is probed last, when nothing past it
        // resolves, so that a link right under it is followed and a new path
        // under it compares by its real root. With nothing past it, the whole
        // probe above was the root.
        let found = match found {
            None if lead > 0 && i == lead && parts.len() > lead => calls.canonicalize(&base)?.ok(),
            found => found,
        };
        if let Some(found) = found {
            (base, real) = (found, true);
        }
        i += n;
        // A `let`-chain: the `?` runs only once `real` holds and the component
        // is `Normal`, so the resolver-call budget is spent exactly as the
        // single condition would spend it.
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

/// `p` with `.` dropped and each `..` removed with the name before it, as
/// Windows reads a path before it follows any link. A `..` at a root stays
/// there. A leading `..` stays in a relative path and after a bare drive
/// (`C:`), which is a working directory too. `foldText` in the TypeScript
/// package's `resolve.ts` is the same rule.
///
/// The walk calls it on Windows, and [`Guard::real_path`] on every platform
/// when the walk gives up. It reads `p` with the platform's components.
pub(crate) fn fold_text(p: &Path) -> PathBuf {
    let rooted = p.has_root();
    let (mut root, mut out) = (Vec::new(), Vec::<Component>::new());
    for c in p.components() {
        match c {
            Component::Prefix(_) | Component::RootDir => root.push(c),
            Component::CurDir => {
                if out.is_empty() && !rooted {
                    out.push(c);
                }
            }
            Component::ParentDir => match out.last() {
                Some(Component::CurDir) => *out.last_mut().expect("not empty") = c,
                Some(Component::Normal(_)) => {
                    out.pop();
                }
                _ if !rooted => out.push(c),
                _ => {}
            },
            Component::Normal(_) => out.push(c),
        }
    }
    root.iter().chain(&out).collect()
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
    // A `let`-chain, as in `walk`.
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
