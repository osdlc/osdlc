//! The filesystem seam — where this crate stops being pure.
//!
//! Everything above this module is arithmetic on strings and paths; everything
//! below it is a host's problem. That split is what lets one core serve both a
//! native shell and a `wasm32-unknown-unknown` build of itself. The crate already *compiles* to wasm — what it cannot do
//! there is run, because `wasm32-unknown-unknown` has no filesystem and every
//! `std::fs` call compiles cleanly and then fails at runtime. Taking I/O as a
//! `&dyn Vfs` parameter moves that failure forward to the host boundary, where
//! the Obsidian bridge answers out of the `Vault` API instead.
//!
//! # A trait object, not a generic
//!
//! Callers take `&dyn Vfs`, not `V: Vfs`. Object safety is a requirement: the
//! wasm bridge holds one implementation backed by a table of JS callbacks, so
//! monomorphising the core over it costs a type parameter on every public
//! function the hosts call and buys nothing.
//!
//! # The method set
//!
//! Nine required methods cover every call site the core has today plus the
//! writes the publish and marketplace paths need, including
//! [`Vfs::rename`]/[`Vfs::remove`], the two mutations an atomic swap is made
//! of. There is deliberately no `metadata`/`stat`: the only caller that wants
//! a byte count — [`crate::skill`]'s supporting-file listing — derives it from
//! a read, over a directory bounded to one skill's own peers, and a `stat`
//! would be a second way to ask that every host, including the ones whose file
//! APIs are asynchronous and content-oriented, would have to implement.
//!
//! Three more have defaults, so they cost no host anything: [`Vfs::canonicalize`],
//! [`Vfs::read_link`] and [`Vfs::is_symlink`], the questions only a real
//! filesystem can answer about links. [`crate::guard::resolve_write_path`] needs the first —
//! *where does this path really lead* — and `std::fs::canonicalize` is exactly
//! the call that must not appear above this seam: it has no meaning on
//! `wasm32-unknown-unknown`. So it is a method here, [`NativeVfs`] answers it
//! with the real thing, and a host that cannot resolve links inherits the
//! lexical answer rather than a compile error. `is_symlink` follows the same
//! pattern for the question discovery asks; see its own doc.
//!
//! # Three implementations
//!
//! [`NativeVfs`] is `std::fs` and [`MemVfs`] is a tree in memory. [`PreviewVfs`]
//! is neither: it wraps one of the others, passes reads through, and captures
//! mutations — writes as bytes, renames and removals as a [`PlannedOp`] list —
//! which is how [`crate::publish::PublishMode::DryRun`] classifies a publish
//! without performing one. What it means to a publish is [`crate::publish`]'s
//! doc.
//!
//! # Directory listings, not a walker
//!
//! [`Vfs::read_dir`] lists one directory. Recursion lives in [`crate::scan`],
//! above the seam, so the traversal rules — depth bound, [`crate::scan::SKIP_DIRS`]
//! pruning, dot-directories kept — are the same rules on every host rather
//! than something each bridge reimplements and gets subtly wrong.

use std::cell::RefCell;
use std::collections::{BTreeMap, BTreeSet};
use std::io;
use std::path::{Component, Path, PathBuf};

use crate::error::CoreError;

/// One entry in a directory listing. Deliberately the minimum a walk needs:
/// a name and whether to descend into it.
///
/// `is_dir` is resolved *without* following symlinks, matching the walker's
/// contract — a symlinked directory reports `is_dir: false` and is therefore
/// never descended into.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DirEntry {
    /// The entry's file name.
    pub name: String,
    /// Whether the entry is a directory (symlinks are not followed).
    pub is_dir: bool,
}

/// The host's filesystem, as this crate needs it.
pub trait Vfs {
    /// Reads a file's bytes.
    fn read_file(&self, path: &Path) -> Result<Vec<u8>, CoreError>;
    /// Lists a directory's entries.
    fn read_dir(&self, path: &Path) -> Result<Vec<DirEntry>, CoreError>;
    /// Writes a file, replacing any existing one.
    fn write_file(&self, path: &Path, bytes: &[u8]) -> Result<(), CoreError>;
    /// Creates a directory and its parents.
    fn create_dir_all(&self, path: &Path) -> Result<(), CoreError>;
    /// Whether the path exists.
    fn exists(&self, path: &Path) -> bool;
    /// Whether the file has its execute bit set.
    fn is_executable(&self, path: &Path) -> bool;
    /// Sets or clears the file's execute bit.
    fn set_executable(&self, path: &Path, yes: bool) -> Result<(), CoreError>;

    /// Moves a file, or a directory with everything under it, from `from` to
    /// `to`.
    ///
    /// The contract is deliberately narrower than `std::fs::rename`: `from`
    /// must exist, `to` must **not**, and `to`'s parent directory must. POSIX
    /// rename silently replaces an existing file where Windows refuses to, so
    /// a seam that passed the platform's answer through would make the same
    /// swap succeed on one host and fail on another. Refusing an occupied
    /// destination everywhere keeps the one calling pattern — rename the old
    /// aside, rename the new in — portable, and that pattern is the whole
    /// reason the method exists: it is the temp-and-rename the marketplace's
    /// atomic commit stages through.
    fn rename(&self, from: &Path, to: &Path) -> Result<(), CoreError>;

    /// Removes a file, or a directory and everything under it.
    ///
    /// Removing what is not there is an error rather than a no-op. The
    /// callers this serves — the swap's rollback, and later the orphan sweep
    /// — know exactly what they expect to remove, and a silent pass on a
    /// missing path would hide the moment they are wrong about it. A caller
    /// that genuinely does not care asks [`Vfs::exists`] first.
    fn remove(&self, path: &Path) -> Result<(), CoreError>;

    /// Is this path itself a symlink — the link, not what it points at?
    ///
    /// The question [`crate::discover`] asks: a skills source may not contain
    /// links, because a link reads as inside the tree and resolves outside
    /// it, and a bundle copied file-by-file would silently flatten it.
    /// [`Vfs::read_dir`] already refuses to *descend* into a symlinked
    /// directory by reporting `is_dir: false` — but that makes a linked
    /// directory indistinguishable from a file, and refusing loudly needs the
    /// two told apart. This method is that distinction.
    ///
    /// The default is `false`, mirroring [`Vfs::canonicalize`]'s lexical
    /// default: a host with no link resolution — [`MemVfs`], or the wasm
    /// bridge when its host object has no link methods — has no links to
    /// report, and the honest answer costs it no new method.
    fn is_symlink(&self, _path: &Path) -> bool {
        false
    }

    /// Where `path` really leads, with every symlink on the way resolved.
    ///
    /// The containment check in [`crate::guard::resolve_write_path`] compares a
    /// destination root against a path under it, and a lexical comparison walks
    /// straight past a symlinked alias: `dest/skills/x` is inside `dest/` by
    /// every rule a string can state, and outside it on disk the moment
    /// `dest/skills` is a link. Only this method can tell the difference, and
    /// only a host holding a real filesystem can implement it.
    ///
    /// # The default is lexical — a floor, not an answer
    ///
    /// A host with no link resolution — the wasm bridge when its host object
    /// has no link methods, [`MemVfs`], any tree that has no links to see
    /// through — gets `.` and
    /// `..` folded away and nothing else — never *weaker* than the lexical
    /// rule the check also applies. A host that can resolve links should
    /// override this.
    ///
    /// # Errors
    ///
    /// Implementations that resolve links report a path that does not exist as
    /// an error, exactly as `std::fs::canonicalize` does — there is nothing on
    /// disk to follow. Callers are expected to walk up to an ancestor that does
    /// exist rather than treat that as a refusal.
    fn canonicalize(&self, path: &Path) -> Result<PathBuf, CoreError> {
        Ok(normalize(path))
    }

    /// Can a symlink hide from this host?
    ///
    /// `true` means either [`Vfs::canonicalize`] reflects the physical
    /// filesystem ([`NativeVfs`]) or the tree cannot hold a link at all
    /// ([`MemVfs`]) — so a lexical answer is a complete answer. The default
    /// is `false`: a bridge that left `canonicalize` at the lexical default
    /// while fronting a real filesystem (the wasm bridge over a host object
    /// with no link methods) is exactly the host a link can hide from, and the
    /// publish rail must not narrow there.
    fn sees_links(&self) -> bool {
        false
    }

    /// The target text of the symlink at `path`, unresolved, as
    /// `std::fs::read_link` answers.
    ///
    /// The guard asks this of a path that [`Vfs::canonicalize`] cannot
    /// resolve, so a dangling link is checked by where its target would land.
    /// The default is an error: a host with no links has none to read. A host
    /// that overrides [`Vfs::canonicalize`] must override this too, or a
    /// dangling link is not followed.
    fn read_link(&self, path: &Path) -> Result<PathBuf, CoreError> {
        Err(CoreError::io(
            path,
            io::Error::new(io::ErrorKind::Unsupported, "this host has no symlinks"),
        ))
    }
}

/// `std::fs`. What a CLI and this crate's own tests use.
#[derive(Debug, Clone, Copy, Default)]
pub struct NativeVfs;

impl Vfs for NativeVfs {
    fn read_file(&self, path: &Path) -> Result<Vec<u8>, CoreError> {
        std::fs::read(path).map_err(|e| CoreError::io(path, e))
    }

    fn read_dir(&self, path: &Path) -> Result<Vec<DirEntry>, CoreError> {
        let entries = std::fs::read_dir(path).map_err(|e| CoreError::io(path, e))?;
        let mut out = Vec::new();
        for entry in entries.flatten() {
            // `DirEntry::file_type` reads the link itself, not its target, so a
            // symlink to a directory is reported as a non-directory and the
            // walk above never follows it.
            let is_dir = entry.file_type().is_ok_and(|t| t.is_dir());
            // Lossy because `DirEntry::name` is a `String`: a name that is not
            // UTF-8 cannot cross the wasm boundary intact, and mangling it here
            // costs at most one unreachable path on one exotic filesystem.
            out.push(DirEntry {
                name: entry.file_name().to_string_lossy().into_owned(),
                is_dir,
            });
        }
        Ok(out)
    }

    fn write_file(&self, path: &Path, bytes: &[u8]) -> Result<(), CoreError> {
        std::fs::write(path, bytes).map_err(|e| CoreError::io(path, e))
    }

    fn create_dir_all(&self, path: &Path) -> Result<(), CoreError> {
        std::fs::create_dir_all(path).map_err(|e| CoreError::io(path, e))
    }

    fn exists(&self, path: &Path) -> bool {
        path.exists()
    }

    #[cfg(unix)]
    fn is_executable(&self, path: &Path) -> bool {
        use std::os::unix::fs::PermissionsExt;
        std::fs::metadata(path).is_ok_and(|m| m.permissions().mode() & 0o111 != 0)
    }

    /// Windows has no execute bit. Reporting `false` rather than guessing from
    /// an extension keeps the answer honest; the publish writer treats an
    /// unset bit as "nothing to do".
    #[cfg(not(unix))]
    fn is_executable(&self, _path: &Path) -> bool {
        false
    }

    #[cfg(unix)]
    fn set_executable(&self, path: &Path, yes: bool) -> Result<(), CoreError> {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(path)
            .map_err(|e| CoreError::io(path, e))?
            .permissions();
        let mode = perms.mode();
        perms.set_mode(if yes { mode | 0o111 } else { mode & !0o111 });
        std::fs::set_permissions(path, perms).map_err(|e| CoreError::io(path, e))
    }

    /// A no-op, not an error: the caller asked for a bit this platform does
    /// not have, and failing the whole publish over it would be the wrong trade.
    #[cfg(not(unix))]
    fn set_executable(&self, _path: &Path, _yes: bool) -> Result<(), CoreError> {
        Ok(())
    }

    fn rename(&self, from: &Path, to: &Path) -> Result<(), CoreError> {
        // The occupied-destination refusal is the contract's, not the
        // platform's: POSIX would replace a file here and Windows would error,
        // and the seam has to give one answer on both. `symlink_metadata`, so
        // a destination that is a link counts as occupied — the link, not its
        // target, is what a rename onto it would clobber.
        if let Ok(meta) = std::fs::symlink_metadata(to) {
            let what = if meta.is_dir() {
                "a directory"
            } else {
                "a file"
            };
            return Err(in_the_way(to, what));
        }
        std::fs::rename(from, to).map_err(|e| CoreError::io(from, e))
    }

    fn remove(&self, path: &Path) -> Result<(), CoreError> {
        // `symlink_metadata`, so a link is removed as itself: it reports as
        // not-a-directory, `remove_file` unlinks it, and whatever it pointed
        // at is untouched. Following it first would delete the target.
        let meta = std::fs::symlink_metadata(path).map_err(|e| CoreError::io(path, e))?;
        if meta.is_dir() {
            std::fs::remove_dir_all(path)
        } else {
            std::fs::remove_file(path)
        }
        .map_err(|e| CoreError::io(path, e))
    }

    /// The real thing, like [`NativeVfs::canonicalize`]: the one
    /// implementation with links to see.
    fn is_symlink(&self, path: &Path) -> bool {
        std::fs::symlink_metadata(path).is_ok_and(|m| m.file_type().is_symlink())
    }

    /// The real thing. This is the one implementation that can see a symlink,
    /// and it is the reason the method is on the trait at all.
    fn canonicalize(&self, path: &Path) -> Result<PathBuf, CoreError> {
        std::fs::canonicalize(path).map_err(|e| CoreError::io(path, e))
    }

    fn sees_links(&self) -> bool {
        true
    }

    fn read_link(&self, path: &Path) -> Result<PathBuf, CoreError> {
        std::fs::read_link(path).map_err(|e| CoreError::io(path, e))
    }
}

/// An in-memory tree.
///
/// Public rather than `#[cfg(test)]` on purpose: the wasm crate's tests and
/// any host that wants to rehearse a publish need a filesystem that exists
/// where no filesystem does. It is also the cheapest way to write a walk test
/// that does not depend on what a real directory happens to return first.
///
/// Faithful to `std::fs` where it matters — writing into a directory that was
/// never created fails, and rewriting a file keeps its execute bit — so a test
/// that passes here is not passing on leniency the native path does not have.
///
/// It has no symlinks, so it keeps the trait's lexical [`Vfs::canonicalize`]:
/// there is nothing here for a resolver to see through, and inventing one would
/// let a test pass on a filesystem property no real tree has.
#[derive(Debug, Default)]
pub struct MemVfs {
    inner: RefCell<Tree>,
}

#[derive(Debug, Default)]
struct Tree {
    dirs: BTreeSet<PathBuf>,
    files: BTreeMap<PathBuf, MemFile>,
}

#[derive(Debug, Clone)]
struct MemFile {
    bytes: Vec<u8>,
    executable: bool,
}

impl MemVfs {
    /// Creates an empty in-memory filesystem.
    pub fn new() -> Self {
        Self::default()
    }
}

impl Vfs for MemVfs {
    /// No way to create a link in this tree, so nothing can hide from the
    /// lexical default.
    fn sees_links(&self) -> bool {
        true
    }

    fn read_file(&self, path: &Path) -> Result<Vec<u8>, CoreError> {
        let path = normalize(path);
        let inner = self.inner.borrow();
        match inner.files.get(&path) {
            Some(file) => Ok(file.bytes.clone()),
            None if inner.dirs.contains(&path) => Err(in_the_way(&path, "a directory")),
            None => Err(missing(&path)),
        }
    }

    fn read_dir(&self, path: &Path) -> Result<Vec<DirEntry>, CoreError> {
        let dir = normalize(path);
        let inner = self.inner.borrow();
        if !inner.dirs.contains(&dir) {
            return Err(missing(&dir));
        }
        let children = |name: &PathBuf| name.parent() == Some(dir.as_path());
        let mut out: Vec<DirEntry> = inner
            .dirs
            .iter()
            .filter(|d| children(d))
            .map(|d| DirEntry {
                name: leaf(d),
                is_dir: true,
            })
            .collect();
        out.extend(
            inner
                .files
                .keys()
                .filter(|f| children(f))
                .map(|f| DirEntry {
                    name: leaf(f),
                    is_dir: false,
                }),
        );
        Ok(out)
    }

    fn write_file(&self, path: &Path, bytes: &[u8]) -> Result<(), CoreError> {
        let path = normalize(path);
        let mut inner = self.inner.borrow_mut();
        if inner.dirs.contains(&path) {
            return Err(in_the_way(&path, "a directory"));
        }
        match path.parent() {
            Some(parent) if inner.dirs.contains(parent) => {}
            _ => return Err(missing(&path)),
        }
        // Rewriting a file keeps its mode, as an `fs::write` over an existing
        // file does.
        let executable = inner.files.get(&path).is_some_and(|f| f.executable);
        inner.files.insert(
            path,
            MemFile {
                bytes: bytes.to_vec(),
                executable,
            },
        );
        Ok(())
    }

    fn create_dir_all(&self, path: &Path) -> Result<(), CoreError> {
        let path = normalize(path);
        let mut inner = self.inner.borrow_mut();
        let mut ancestors: Vec<&Path> = path.ancestors().collect();
        ancestors.reverse();
        for ancestor in ancestors {
            if ancestor.as_os_str().is_empty() {
                continue;
            }
            if inner.files.contains_key(ancestor) {
                return Err(in_the_way(ancestor, "a file"));
            }
            inner.dirs.insert(ancestor.to_path_buf());
        }
        Ok(())
    }

    fn exists(&self, path: &Path) -> bool {
        let path = normalize(path);
        let inner = self.inner.borrow();
        inner.dirs.contains(&path) || inner.files.contains_key(&path)
    }

    fn is_executable(&self, path: &Path) -> bool {
        let path = normalize(path);
        self.inner
            .borrow()
            .files
            .get(&path)
            .is_some_and(|f| f.executable)
    }

    fn set_executable(&self, path: &Path, yes: bool) -> Result<(), CoreError> {
        let path = normalize(path);
        let mut inner = self.inner.borrow_mut();
        match inner.files.get_mut(&path) {
            Some(file) => {
                file.executable = yes;
                Ok(())
            }
            None => Err(missing(&path)),
        }
    }

    fn rename(&self, from: &Path, to: &Path) -> Result<(), CoreError> {
        let from = normalize(from);
        let to = normalize(to);
        let mut inner = self.inner.borrow_mut();

        let moving_file = inner.files.contains_key(&from);
        if !moving_file && !inner.dirs.contains(&from) {
            return Err(missing(&from));
        }
        if inner.files.contains_key(&to) {
            return Err(in_the_way(&to, "a file"));
        }
        if inner.dirs.contains(&to) {
            return Err(in_the_way(&to, "a directory"));
        }
        match to.parent() {
            Some(parent) if inner.dirs.contains(parent) => {}
            _ => return Err(missing(&to)),
        }

        if moving_file {
            let file = inner.files.remove(&from).expect("presence checked above");
            // Moved whole, mode and all — a rename never touches content.
            inner.files.insert(to, file);
            return Ok(());
        }

        // A directory into its own subtree has nowhere coherent to land; the
        // real filesystems refuse it (EINVAL) and so does this one.
        if to.starts_with(&from) {
            return Err(into_itself(&from));
        }
        let relocate = |path: &Path| to.join(path.strip_prefix(&from).expect("prefix-filtered"));
        let dirs: Vec<PathBuf> = inner
            .dirs
            .iter()
            .filter(|d| d.starts_with(&from))
            .cloned()
            .collect();
        for dir in dirs {
            inner.dirs.remove(&dir);
            inner.dirs.insert(relocate(&dir));
        }
        let files: Vec<PathBuf> = inner
            .files
            .keys()
            .filter(|f| f.starts_with(&from))
            .cloned()
            .collect();
        for file in files {
            let value = inner.files.remove(&file).expect("listed above");
            inner.files.insert(relocate(&file), value);
        }
        Ok(())
    }

    fn remove(&self, path: &Path) -> Result<(), CoreError> {
        let path = normalize(path);
        let mut inner = self.inner.borrow_mut();
        if inner.files.remove(&path).is_some() {
            return Ok(());
        }
        if !inner.dirs.contains(&path) {
            return Err(missing(&path));
        }
        inner.dirs.retain(|d| !d.starts_with(&path));
        inner.files.retain(|f, _| !f.starts_with(&path));
        Ok(())
    }
}

/// A write-capturing overlay over another filesystem — the mechanism behind
/// [`crate::publish::PublishMode::DryRun`].
///
/// Reads fall through to the filesystem underneath unless this overlay has
/// already written the path; writes land in memory and never reach it. So a
/// publish run against one classifies every file exactly as it would against
/// the real tree, and leaves the real tree byte-identical.
///
/// It captures rather than discards because a wrapper whose writes were no-ops
/// breaks as soon as one run writes a path and then looks at it again: the
/// second look would see the stale bytes underneath and classify them wrong.
///
/// # What it is faithful about, and what it is not
///
/// Faithful: the merged view of what exists, the bytes at a path, the execute
/// bit, a rewrite preserving the previous bit, a write into a directory that
/// was never created failing, and `create_dir_all` refusing to put a directory
/// where a file is — the same rules [`MemVfs`] holds itself to.
///
/// Not faithful, and it cannot be: a write into memory does not fail for
/// permissions, a read-only mount, or a full disk. A preview can report
/// `written` where a real run fails with `io`.
///
/// # The captured bytes
///
/// [`PreviewVfs::into_writes`] hands back exactly what would have landed, per
/// path. Nothing in the publish path consumes it today — a
/// [`crate::publish::PublishReport`] is a status list.
pub struct PreviewVfs<'a> {
    under: &'a dyn Vfs,
    overlay: RefCell<Overlay>,
}

/// The overlay alone: [`Vfs`] is not `Debug`, and what a reader wants from a
/// preview is what it captured.
impl std::fmt::Debug for PreviewVfs<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PreviewVfs")
            .field("captured", &self.overlay)
            .finish_non_exhaustive()
    }
}

/// One file a preview captured: the bytes that would have landed, and the
/// execute bit they would have landed with.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreviewWrite {
    /// The bytes that would have been written.
    pub bytes: Vec<u8>,
    /// The execute bit the file would have had.
    pub executable: bool,
}

/// One mutation a preview captured instead of performing — the rename/remove
/// half of the plan, beside the bytes [`PreviewVfs::into_writes`] holds.
///
/// Captured as an *operation* rather than expanded into per-file writes and
/// deletions, because that is what the real run performs: a swap that renames
/// a directory moves one inode, and a report that listed its every file as
/// written would describe a much more dangerous run than the one planned.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PlannedOp {
    /// `rename(from, to)` would have moved this file or tree.
    Rename {
        /// The path moved from.
        from: PathBuf,
        /// The path moved to.
        to: PathBuf,
    },
    /// `remove(path)` would have taken this file or tree away.
    Remove {
        /// The path removed.
        path: PathBuf,
    },
}

#[derive(Debug, Default)]
struct Overlay {
    dirs: BTreeSet<PathBuf>,
    files: BTreeMap<PathBuf, PreviewWrite>,
    /// Bytes a rename relocated, at their post-rename paths. A separate map
    /// from `files` so [`PreviewVfs::into_writes`] stays what its name says:
    /// a renamed file was moved by the run, not written by it, and reporting
    /// it as a write would double-count what `ops` already carries.
    moved: BTreeMap<PathBuf, PreviewWrite>,
    /// Execute-bit changes to files this overlay did *not* write. The
    /// chmod-only path is a real publish outcome, and a later read has to see
    /// it without the file underneath being touched.
    modes: BTreeMap<PathBuf, bool>,
    /// Roots a remove — or the outbound half of a rename — took away.
    /// Tombstones over the tree underneath: a path at or below one is gone
    /// from the merged view unless an overlay map re-created it afterwards,
    /// which is why every consultation checks the maps before this set.
    removed: BTreeSet<PathBuf>,
    /// Every rename and remove, in call order — the half of the plan that is
    /// operations rather than bytes.
    ops: Vec<PlannedOp>,
}

impl Overlay {
    /// Is this path at or below a tombstoned root? `true` means "gone
    /// *underneath*", not "gone" — the overlay maps outrank it, and callers
    /// consult them first.
    fn suppressed(&self, path: &Path) -> bool {
        path.ancestors().any(|a| self.removed.contains(a))
    }

    /// Drops every overlay entry at or under `root` — what both mutations do
    /// to the space they vacate, so a stale capture cannot shadow the
    /// tombstone that replaces it.
    fn vacate(&mut self, root: &Path) {
        self.files.retain(|p, _| !p.starts_with(root));
        self.moved.retain(|p, _| !p.starts_with(root));
        self.modes.retain(|p, _| !p.starts_with(root));
        self.dirs.retain(|p| !p.starts_with(root));
    }
}

impl<'a> PreviewVfs<'a> {
    /// Wraps `under`. Nothing is copied — the overlay starts empty and fills
    /// as the run writes.
    pub fn over(under: &'a dyn Vfs) -> Self {
        Self {
            under,
            overlay: RefCell::new(Overlay::default()),
        }
    }

    /// Every file the run would have written, in path order.
    ///
    /// Only genuine writes: a file the run left alone is absent, one it merely
    /// chmod'd is absent, and so is content a rename merely relocated — the
    /// renames and removals are [`PreviewVfs::operations`]' to report, and a
    /// write the run itself later renamed away or removed reports where the
    /// merged view says it ended up, not where it briefly was.
    pub fn into_writes(self) -> BTreeMap<PathBuf, PreviewWrite> {
        self.overlay.into_inner().files
    }

    /// Every rename and remove the run asked for, in call order — the plan a
    /// dry run reports.
    ///
    /// By reference rather than consuming, unlike [`PreviewVfs::into_writes`]:
    /// a caller assembling a report wants both halves of the plan, and a
    /// second consuming accessor could only hand over one of them.
    pub fn operations(&self) -> Vec<PlannedOp> {
        self.overlay.borrow().ops.clone()
    }

    /// Is this a directory in the merged view?
    ///
    /// [`Vfs`] has no `is_dir`, so a successful listing stands in for one —
    /// which is exactly the question a write has to answer about its parent.
    fn is_dir(&self, path: &Path) -> bool {
        {
            let overlay = self.overlay.borrow();
            if overlay.dirs.contains(path) {
                return true;
            }
            if overlay.suppressed(path) {
                return false;
            }
        }
        self.under.read_dir(path).is_ok()
    }

    /// Is this a file in the merged view? A path that exists and cannot be
    /// listed.
    fn is_file(&self, path: &Path) -> bool {
        {
            let overlay = self.overlay.borrow();
            if overlay.files.contains_key(path) || overlay.moved.contains_key(path) {
                return true;
            }
            if overlay.suppressed(path) {
                return false;
            }
        }
        self.under.exists(path) && self.under.read_dir(path).is_err()
    }

    /// Reads a subtree out of the merged view — every directory, and every
    /// file's bytes and bit, relative to `root`. What a rename has to take
    /// with it, gathered *before* the tombstone lands and makes these paths
    /// unreadable.
    fn collect(
        &self,
        root: &Path,
        relative: &Path,
        dirs: &mut Vec<PathBuf>,
        files: &mut Vec<(PathBuf, PreviewWrite)>,
    ) -> Result<(), CoreError> {
        for entry in self.read_dir(&root.join(relative))? {
            let rel = relative.join(&entry.name);
            if entry.is_dir {
                dirs.push(rel.clone());
                self.collect(root, &rel, dirs, files)?;
            } else {
                let path = root.join(&rel);
                files.push((
                    rel,
                    PreviewWrite {
                        bytes: self.read_file(&path)?,
                        executable: self.is_executable(&path),
                    },
                ));
            }
        }
        Ok(())
    }
}

impl Vfs for PreviewVfs<'_> {
    fn read_file(&self, path: &Path) -> Result<Vec<u8>, CoreError> {
        let path = normalize(path);
        {
            let overlay = self.overlay.borrow();
            if let Some(file) = overlay
                .files
                .get(&path)
                .or_else(|| overlay.moved.get(&path))
            {
                return Ok(file.bytes.clone());
            }
            if overlay.suppressed(&path) {
                return Err(missing(&path));
            }
        }
        self.under.read_file(&path)
    }

    fn read_dir(&self, path: &Path) -> Result<Vec<DirEntry>, CoreError> {
        let dir = normalize(path);
        let overlay = self.overlay.borrow();
        // A name written here shadows the same name underneath, which is what
        // makes the merged listing agree with the merged reads.
        let mut names: BTreeMap<String, bool> = BTreeMap::new();
        if overlay.suppressed(&dir) {
            // Gone underneath: it lists only if the overlay re-created it,
            // and then it lists only what the overlay holds.
            if !overlay.dirs.contains(&dir) {
                return Err(missing(&dir));
            }
        } else {
            match self.under.read_dir(&dir) {
                Ok(entries) => {
                    for entry in entries {
                        // A tombstoned child is out of the merged view; one
                        // the run re-created comes back in the overlay passes.
                        if !overlay.suppressed(&dir.join(&entry.name)) {
                            names.insert(entry.name, entry.is_dir);
                        }
                    }
                }
                // Unreadable underneath is only an error if this overlay has
                // not created the directory itself.
                Err(e) if !overlay.dirs.contains(&dir) => return Err(e),
                Err(_) => {}
            }
        }
        let child_of = |p: &&PathBuf| p.parent() == Some(dir.as_path());
        for created in overlay.dirs.iter().filter(child_of) {
            names.insert(leaf(created), true);
        }
        for written in overlay
            .files
            .keys()
            .chain(overlay.moved.keys())
            .filter(child_of)
        {
            names.insert(leaf(written), false);
        }
        Ok(names
            .into_iter()
            .map(|(name, is_dir)| DirEntry { name, is_dir })
            .collect())
    }

    fn write_file(&self, path: &Path, bytes: &[u8]) -> Result<(), CoreError> {
        let path = normalize(path);
        if self.is_dir(&path) {
            return Err(in_the_way(&path, "a directory"));
        }
        match path.parent() {
            Some(parent) if self.is_dir(parent) => {}
            _ => return Err(missing(&path)),
        }
        // A rewrite preserves the mode, as `fs::write` over an existing file
        // does — including when the file it is rewriting is underneath.
        let executable = self.is_executable(&path);
        self.overlay.borrow_mut().files.insert(
            path,
            PreviewWrite {
                bytes: bytes.to_vec(),
                executable,
            },
        );
        Ok(())
    }

    fn create_dir_all(&self, path: &Path) -> Result<(), CoreError> {
        let path = normalize(path);
        let mut ancestors: Vec<&Path> = path.ancestors().collect();
        ancestors.reverse();
        for ancestor in ancestors {
            if ancestor.as_os_str().is_empty() {
                continue;
            }
            if self.is_file(ancestor) {
                return Err(in_the_way(ancestor, "a file"));
            }
            self.overlay
                .borrow_mut()
                .dirs
                .insert(ancestor.to_path_buf());
        }
        Ok(())
    }

    fn exists(&self, path: &Path) -> bool {
        let path = normalize(path);
        {
            let overlay = self.overlay.borrow();
            if overlay.files.contains_key(&path)
                || overlay.moved.contains_key(&path)
                || overlay.dirs.contains(&path)
            {
                return true;
            }
            if overlay.suppressed(&path) {
                return false;
            }
        }
        self.under.exists(&path)
    }

    fn is_executable(&self, path: &Path) -> bool {
        let path = normalize(path);
        let here = {
            let overlay = self.overlay.borrow();
            match overlay
                .files
                .get(&path)
                .or_else(|| overlay.moved.get(&path))
            {
                Some(file) => Some(file.executable),
                // Gone is not executable — asking underneath would answer for
                // a file the merged view no longer has.
                None if overlay.suppressed(&path) => Some(false),
                None => overlay.modes.get(&path).copied(),
            }
        };
        here.unwrap_or_else(|| self.under.is_executable(&path))
    }

    fn set_executable(&self, path: &Path, yes: bool) -> Result<(), CoreError> {
        let path = normalize(path);
        // Asked before the mutable borrow, because the filesystem underneath
        // must not be consulted while this overlay is held open.
        let exists_underneath = self.under.exists(&path);
        let mut overlay = self.overlay.borrow_mut();
        if let Some(file) = overlay.files.get_mut(&path) {
            file.executable = yes;
            return Ok(());
        }
        if let Some(file) = overlay.moved.get_mut(&path) {
            file.executable = yes;
            return Ok(());
        }
        // Nothing to chmod: never created here, and gone or absent underneath
        // — the same refusal `MemVfs` and `NativeVfs` give.
        if overlay.suppressed(&path) || !exists_underneath {
            return Err(missing(&path));
        }
        overlay.modes.insert(path, yes);
        Ok(())
    }

    /// Captured, not performed: the merged view moves, the plan records it,
    /// and the tree underneath never learns. The preconditions are the same
    /// ones the real implementations enforce, asked of the merged view, so a
    /// dry run refuses exactly where a real run would.
    fn rename(&self, from: &Path, to: &Path) -> Result<(), CoreError> {
        let from = normalize(from);
        let to = normalize(to);
        if !self.exists(&from) {
            return Err(missing(&from));
        }
        if self.exists(&to) {
            let what = if self.is_dir(&to) {
                "a directory"
            } else {
                "a file"
            };
            return Err(in_the_way(&to, what));
        }
        match to.parent() {
            Some(parent) if self.is_dir(parent) => {}
            _ => return Err(missing(&to)),
        }

        if self.is_dir(&from) {
            if to.starts_with(&from) {
                return Err(into_itself(&from));
            }
            // Materialised out of the merged view before the overlay changes:
            // once the tombstone lands, these paths read as gone.
            let mut dirs = Vec::new();
            let mut files = Vec::new();
            self.collect(&from, Path::new(""), &mut dirs, &mut files)?;
            let mut overlay = self.overlay.borrow_mut();
            overlay.vacate(&from);
            overlay.removed.insert(from.clone());
            overlay.dirs.insert(to.clone());
            for rel in dirs {
                overlay.dirs.insert(to.join(rel));
            }
            for (rel, write) in files {
                overlay.moved.insert(to.join(rel), write);
            }
            overlay.ops.push(PlannedOp::Rename { from, to });
        } else {
            let write = PreviewWrite {
                bytes: self.read_file(&from)?,
                executable: self.is_executable(&from),
            };
            let mut overlay = self.overlay.borrow_mut();
            overlay.vacate(&from);
            overlay.removed.insert(from.clone());
            overlay.moved.insert(to.clone(), write);
            overlay.ops.push(PlannedOp::Rename { from, to });
        }
        Ok(())
    }

    /// Captured, not performed — a tombstone over the merged view and a line
    /// in the plan.
    fn remove(&self, path: &Path) -> Result<(), CoreError> {
        let path = normalize(path);
        if !self.exists(&path) {
            return Err(missing(&path));
        }
        let mut overlay = self.overlay.borrow_mut();
        overlay.vacate(&path);
        overlay.removed.insert(path.clone());
        overlay.ops.push(PlannedOp::Remove { path });
        Ok(())
    }

    /// Answered like [`PreviewVfs::canonicalize`] — from the tree underneath,
    /// with the path as written — except where the overlay has spoken: what a
    /// preview writes or moves is bytes, never a link, and what it tombstoned
    /// has nothing left to be one. The overlay is keyed by normalised spelling.
    fn is_symlink(&self, path: &Path) -> bool {
        {
            let key = normalize(path);
            let overlay = self.overlay.borrow();
            if overlay.files.contains_key(&key)
                || overlay.moved.contains_key(&key)
                || overlay.dirs.contains(&key)
                || overlay.suppressed(&key)
            {
                return false;
            }
        }
        self.under.is_symlink(path)
    }

    /// Asked of the tree underneath, always.
    ///
    /// The overlay holds bytes, not links, and nothing it invents is on disk to
    /// resolve — so a directory this preview created answers "not there", and
    /// the caller walks up to an ancestor that is. That is what makes a dry
    /// run's containment check the same check a real run performs: both are
    /// asking the one filesystem that has links in it.
    fn canonicalize(&self, path: &Path) -> Result<PathBuf, CoreError> {
        self.under.canonicalize(path)
    }

    /// The links are underneath, so whether they can be seen is decided there.
    fn sees_links(&self) -> bool {
        self.under.sees_links()
    }

    /// Asked of the tree underneath, like [`PreviewVfs::canonicalize`].
    fn read_link(&self, path: &Path) -> Result<PathBuf, CoreError> {
        self.under.read_link(path)
    }
}

/// A `MemVfs` that fronts for a host whose canonicalize stayed at the
/// lexical default over a real filesystem — the wasm bridge's shape when the
/// host object has no link methods.
#[cfg(test)]
pub(crate) struct LinkBlindVfs(pub(crate) MemVfs);

#[cfg(test)]
impl Vfs for LinkBlindVfs {
    fn sees_links(&self) -> bool {
        false
    }
    fn read_file(&self, path: &Path) -> Result<Vec<u8>, CoreError> {
        self.0.read_file(path)
    }
    fn write_file(&self, path: &Path, bytes: &[u8]) -> Result<(), CoreError> {
        self.0.write_file(path, bytes)
    }
    fn create_dir_all(&self, path: &Path) -> Result<(), CoreError> {
        self.0.create_dir_all(path)
    }
    fn exists(&self, path: &Path) -> bool {
        self.0.exists(path)
    }
    fn read_dir(&self, path: &Path) -> Result<Vec<DirEntry>, CoreError> {
        self.0.read_dir(path)
    }
    fn set_executable(&self, path: &Path, on: bool) -> Result<(), CoreError> {
        self.0.set_executable(path, on)
    }
    fn is_executable(&self, path: &Path) -> bool {
        self.0.is_executable(path)
    }
    fn rename(&self, from: &Path, to: &Path) -> Result<(), CoreError> {
        self.0.rename(from, to)
    }
    fn remove(&self, path: &Path) -> Result<(), CoreError> {
        self.0.remove(path)
    }
}

/// Resolves `.` and `..` lexically so two spellings of one path are one key.
///
/// Purely lexical: it folds the segments and asks the filesystem nothing, which
/// is also why it is the default [`Vfs::canonicalize`] rather than an answer a
/// host can rely on to see through a link. Public so a host that overrides
/// `canonicalize` only some of the time can fall back to the same answer.
pub fn normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

fn leaf(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

fn missing(path: &Path) -> CoreError {
    CoreError::io(
        path,
        io::Error::new(io::ErrorKind::NotFound, "no such file or directory"),
    )
}

fn in_the_way(path: &Path, what: &str) -> CoreError {
    CoreError::io(
        path,
        io::Error::new(
            io::ErrorKind::AlreadyExists,
            format!("{what} is already there"),
        ),
    )
}

fn into_itself(path: &Path) -> CoreError {
    CoreError::io(
        path,
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "cannot move a directory into its own subtree",
        ),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The behaviour both implementations owe callers, run against each so the
    /// in-memory one cannot drift into being more forgiving than the real one.
    /// Taking `&dyn Vfs` also pins object safety, which the wasm bridge needs.
    fn round_trip(vfs: &dyn Vfs, base: &Path) {
        let notes = base.join("notes");
        let a = notes.join("a.md");

        assert!(!vfs.exists(&a));
        assert!(vfs.read_file(&a).is_err());
        assert!(vfs.read_dir(&notes).is_err());
        // No parent directory yet.
        assert!(vfs.write_file(&a, b"alpha").is_err());

        vfs.create_dir_all(&notes).unwrap();
        vfs.write_file(&a, b"alpha").unwrap();
        vfs.write_file(&notes.join("b.md"), b"beta").unwrap();
        vfs.create_dir_all(&notes.join("nested")).unwrap();

        assert_eq!(vfs.read_file(&a).unwrap(), b"alpha");
        assert!(vfs.exists(&a));
        assert!(vfs.exists(&notes));

        let mut listing = vfs.read_dir(&notes).unwrap();
        listing.sort_by(|x, y| x.name.cmp(&y.name));
        assert_eq!(
            listing,
            vec![
                DirEntry {
                    name: "a.md".into(),
                    is_dir: false
                },
                DirEntry {
                    name: "b.md".into(),
                    is_dir: false
                },
                DirEntry {
                    name: "nested".into(),
                    is_dir: true
                },
            ]
        );

        // Overwrite in place; only immediate children are listed.
        vfs.write_file(&a, b"revised").unwrap();
        assert_eq!(vfs.read_file(&a).unwrap(), b"revised");
        vfs.write_file(&notes.join("nested/deep.md"), b"deep")
            .unwrap();
        assert_eq!(vfs.read_dir(&notes).unwrap().len(), 3);

        // The two mutations, same contract everywhere: a move needs its
        // source present, its destination free, and the destination's parent
        // in place; a removal needs its target present.
        let renamed = notes.join("renamed.md");
        assert!(vfs.rename(&notes.join("missing.md"), &renamed).is_err());
        vfs.rename(&a, &renamed).unwrap();
        assert!(!vfs.exists(&a));
        assert_eq!(vfs.read_file(&renamed).unwrap(), b"revised");
        // An occupied destination refuses rather than replacing — the POSIX
        // silent replace is exactly what the narrowed contract rules out.
        assert!(vfs.rename(&renamed, &notes.join("b.md")).is_err());
        // No parent to land in.
        assert!(vfs.rename(&renamed, &base.join("absent/x.md")).is_err());

        // A directory moves with everything under it, and never into itself.
        let moved = base.join("moved");
        assert!(vfs.rename(&notes, &notes.join("nested/inner")).is_err());
        vfs.rename(&notes, &moved).unwrap();
        assert!(!vfs.exists(&notes));
        assert_eq!(
            vfs.read_file(&moved.join("nested/deep.md")).unwrap(),
            b"deep"
        );

        // Remove a file, then the whole tree; nothing is left of either, and
        // removing what is already gone is an error, not a shrug.
        vfs.remove(&moved.join("b.md")).unwrap();
        assert!(!vfs.exists(&moved.join("b.md")));
        vfs.remove(&moved).unwrap();
        assert!(!vfs.exists(&moved));
        assert!(!vfs.exists(&moved.join("nested/deep.md")));
        assert!(vfs.remove(&moved).is_err());
    }

    #[test]
    fn mem_vfs_round_trips() {
        round_trip(&MemVfs::new(), Path::new("/w"));
    }

    #[test]
    fn native_vfs_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        round_trip(&NativeVfs, &dir.path().join("w"));
    }

    #[test]
    fn mem_vfs_tracks_the_execute_bit_and_keeps_it_across_a_rewrite() {
        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/w")).unwrap();
        vfs.write_file(Path::new("/w/run.sh"), b"#!/bin/sh\n")
            .unwrap();

        assert!(!vfs.is_executable(Path::new("/w/run.sh")));
        vfs.set_executable(Path::new("/w/run.sh"), true).unwrap();
        assert!(vfs.is_executable(Path::new("/w/run.sh")));

        vfs.write_file(Path::new("/w/run.sh"), b"#!/bin/sh\necho\n")
            .unwrap();
        assert!(vfs.is_executable(Path::new("/w/run.sh")));

        vfs.set_executable(Path::new("/w/run.sh"), false).unwrap();
        assert!(!vfs.is_executable(Path::new("/w/run.sh")));
        // Nothing to chmod.
        assert!(vfs.set_executable(Path::new("/w/gone.sh"), true).is_err());
    }

    #[test]
    fn mem_vfs_normalizes_equivalent_spellings_to_one_key() {
        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/w/./notes")).unwrap();
        vfs.write_file(Path::new("/w/notes/a.md"), b"x").unwrap();
        assert!(vfs.exists(Path::new("/w/notes/../notes/a.md")));
    }

    #[cfg(unix)]
    #[test]
    fn native_vfs_toggles_the_execute_bit() {
        let dir = tempfile::tempdir().unwrap();
        let script = dir.path().join("run.sh");
        let vfs = NativeVfs;
        vfs.write_file(&script, b"#!/bin/sh\n").unwrap();

        assert!(!vfs.is_executable(&script));
        vfs.set_executable(&script, true).unwrap();
        assert!(vfs.is_executable(&script));
        vfs.set_executable(&script, false).unwrap();
        assert!(!vfs.is_executable(&script));
    }

    #[test]
    fn preview_vfs_round_trips_and_the_tree_underneath_never_learns_about_it() {
        // The same contract as the other two, so the overlay cannot drift into
        // being more forgiving than the filesystem it stands in front of — the
        // whole value of a preview is that it is not more forgiving.
        let under = MemVfs::new();
        round_trip(&PreviewVfs::over(&under), Path::new("/w"));
        assert!(!under.exists(Path::new("/w")));
    }

    #[test]
    fn preview_vfs_reads_through_shadows_what_it_wrote_and_keeps_the_bytes() {
        let under = MemVfs::new();
        under.create_dir_all(Path::new("/dest")).unwrap();
        under
            .write_file(Path::new("/dest/a.md"), b"original")
            .unwrap();

        let preview = PreviewVfs::over(&under);
        assert_eq!(
            preview.read_file(Path::new("/dest/a.md")).unwrap(),
            b"original"
        );

        preview
            .write_file(Path::new("/dest/a.md"), b"revised")
            .unwrap();
        preview.create_dir_all(Path::new("/dest/new")).unwrap();
        preview
            .write_file(Path::new("/dest/new/b.md"), b"fresh")
            .unwrap();

        // Reading back what it wrote is the difference between this and a
        // no-op writer: a run that looks at one path twice sees what a real
        // run would.
        assert_eq!(
            preview.read_file(Path::new("/dest/a.md")).unwrap(),
            b"revised"
        );
        assert!(preview.exists(Path::new("/dest/new/b.md")));
        let mut listing: Vec<String> = preview
            .read_dir(Path::new("/dest"))
            .unwrap()
            .into_iter()
            .map(|e| e.name)
            .collect();
        listing.sort();
        assert_eq!(listing, vec!["a.md", "new"]);

        // And nothing underneath moved.
        assert_eq!(
            under.read_file(Path::new("/dest/a.md")).unwrap(),
            b"original"
        );
        assert!(!under.exists(Path::new("/dest/new")));

        // The plan's bytes, for a caller that wants more than a status.
        let writes = preview.into_writes();
        assert_eq!(writes.len(), 2);
        assert_eq!(writes[Path::new("/dest/a.md")].bytes, b"revised");
        assert_eq!(writes[Path::new("/dest/new/b.md")].bytes, b"fresh");
    }

    #[test]
    fn preview_vfs_keeps_the_execute_bit_faithful_in_both_directions() {
        let under = MemVfs::new();
        under.create_dir_all(Path::new("/dest")).unwrap();
        under
            .write_file(Path::new("/dest/run.sh"), b"#!/bin/sh\n")
            .unwrap();
        under
            .set_executable(Path::new("/dest/run.sh"), true)
            .unwrap();

        let preview = PreviewVfs::over(&under);
        assert!(preview.is_executable(Path::new("/dest/run.sh")));

        // A chmod on a file this overlay never wrote is visible to it and
        // invisible underneath. The publish writer's chmod-only outcome — a
        // peer whose bytes match and whose bit does not — depends on both.
        preview
            .set_executable(Path::new("/dest/run.sh"), false)
            .unwrap();
        assert!(!preview.is_executable(Path::new("/dest/run.sh")));
        assert!(under.is_executable(Path::new("/dest/run.sh")));

        // A rewrite preserves the mode, as `fs::write` over an existing file
        // does — including when the file being rewritten is underneath.
        preview
            .write_file(Path::new("/dest/run.sh"), b"#!/bin/sh\necho\n")
            .unwrap();
        assert!(!preview.is_executable(Path::new("/dest/run.sh")));

        // Nothing to chmod, here or underneath.
        assert!(
            preview
                .set_executable(Path::new("/dest/gone.sh"), true)
                .is_err()
        );
    }

    #[cfg(unix)]
    #[test]
    fn preview_vfs_over_a_real_directory_leaves_it_alone() {
        // MemVfs is the easy case. The one that matters is the filesystem a
        // publish actually runs against.
        let dir = tempfile::tempdir().unwrap();
        let preview = PreviewVfs::over(&NativeVfs);
        let target = dir.path().join(".claude/skills/x/SKILL.md");

        preview.create_dir_all(target.parent().unwrap()).unwrap();
        preview.write_file(&target, b"# x\n").unwrap();
        preview.set_executable(&target, true).unwrap();

        assert_eq!(preview.read_file(&target).unwrap(), b"# x\n");
        assert!(preview.is_executable(&target));
        // Not one entry on disk.
        assert!(!dir.path().join(".claude").exists());
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 0);
    }

    #[test]
    fn mem_vfs_rename_carries_the_execute_bit_with_the_file() {
        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/w")).unwrap();
        vfs.write_file(Path::new("/w/run.sh"), b"#!/bin/sh\n")
            .unwrap();
        vfs.set_executable(Path::new("/w/run.sh"), true).unwrap();

        vfs.rename(Path::new("/w/run.sh"), Path::new("/w/tool.sh"))
            .unwrap();
        assert!(vfs.is_executable(Path::new("/w/tool.sh")));
        // The default `is_symlink` answer: this tree has no links to report.
        assert!(!vfs.is_symlink(Path::new("/w/tool.sh")));
    }

    #[cfg(unix)]
    #[test]
    fn native_vfs_sees_a_symlink_and_removes_the_link_not_its_target() {
        let dir = tempfile::tempdir().unwrap();
        let vfs = NativeVfs;
        vfs.create_dir_all(&dir.path().join("real")).unwrap();
        vfs.write_file(&dir.path().join("real/kept.md"), b"kept")
            .unwrap();
        std::os::unix::fs::symlink(dir.path().join("real"), dir.path().join("link")).unwrap();

        assert!(vfs.is_symlink(&dir.path().join("link")));
        assert!(!vfs.is_symlink(&dir.path().join("real")));
        assert!(!vfs.is_symlink(&dir.path().join("absent")));

        vfs.remove(&dir.path().join("link")).unwrap();
        assert!(!dir.path().join("link").exists());
        // The link went; what it pointed at did not.
        assert_eq!(
            vfs.read_file(&dir.path().join("real/kept.md")).unwrap(),
            b"kept"
        );
    }

    #[test]
    fn preview_vfs_captures_rename_and_remove_as_a_plan_and_touches_nothing() {
        // The marketplace's swap, previewed: a plugin tree renamed into
        // place, a stale file swept.
        let under = MemVfs::new();
        under
            .create_dir_all(Path::new("/market/plugins/old/skills"))
            .unwrap();
        under
            .write_file(Path::new("/market/plugins/old/skills/SKILL.md"), b"# old\n")
            .unwrap();
        under
            .write_file(Path::new("/market/stale.json"), b"{}\n")
            .unwrap();

        let preview = PreviewVfs::over(&under);
        preview
            .rename(
                Path::new("/market/plugins/old"),
                Path::new("/market/plugins/new"),
            )
            .unwrap();
        preview.remove(Path::new("/market/stale.json")).unwrap();

        // The merged view moved: reads and listings agree the tree is at its
        // new path and the swept file is gone.
        assert!(!preview.exists(Path::new("/market/plugins/old")));
        assert_eq!(
            preview
                .read_file(Path::new("/market/plugins/new/skills/SKILL.md"))
                .unwrap(),
            b"# old\n"
        );
        assert!(!preview.exists(Path::new("/market/stale.json")));
        let listing: Vec<String> = preview
            .read_dir(Path::new("/market"))
            .unwrap()
            .into_iter()
            .map(|e| e.name)
            .collect();
        assert_eq!(listing, vec!["plugins"]);

        // The plan says so, in call order — operations, not per-file writes.
        assert_eq!(
            preview.operations(),
            vec![
                PlannedOp::Rename {
                    from: PathBuf::from("/market/plugins/old"),
                    to: PathBuf::from("/market/plugins/new"),
                },
                PlannedOp::Remove {
                    path: PathBuf::from("/market/stale.json"),
                },
            ]
        );
        // A relocation is not a write.
        assert!(preview.into_writes().is_empty());

        // And the tree underneath never learned any of it happened.
        assert!(under.exists(Path::new("/market/plugins/old/skills/SKILL.md")));
        assert!(under.exists(Path::new("/market/stale.json")));
        assert!(!under.exists(Path::new("/market/plugins/new")));
    }

    #[test]
    fn a_preview_write_after_a_remove_revives_only_what_it_writes() {
        // The tombstone half of the overlay: a removed tree stays gone even
        // where the filesystem underneath still holds it, and a later write
        // brings back exactly the paths it writes — not the neighbours.
        let under = MemVfs::new();
        under.create_dir_all(Path::new("/dest/pack")).unwrap();
        under
            .write_file(Path::new("/dest/pack/a.md"), b"a")
            .unwrap();
        under
            .write_file(Path::new("/dest/pack/b.md"), b"b")
            .unwrap();

        let preview = PreviewVfs::over(&under);
        preview.remove(Path::new("/dest/pack")).unwrap();
        assert!(!preview.exists(Path::new("/dest/pack")));
        assert!(preview.read_file(Path::new("/dest/pack/a.md")).is_err());

        preview.create_dir_all(Path::new("/dest/pack")).unwrap();
        preview
            .write_file(Path::new("/dest/pack/a.md"), b"fresh")
            .unwrap();

        assert_eq!(
            preview.read_file(Path::new("/dest/pack/a.md")).unwrap(),
            b"fresh"
        );
        assert!(!preview.exists(Path::new("/dest/pack/b.md")));
        let names: Vec<String> = preview
            .read_dir(Path::new("/dest/pack"))
            .unwrap()
            .into_iter()
            .map(|e| e.name)
            .collect();
        assert_eq!(names, vec!["a.md"]);
        // Underneath, both originals are exactly where they were.
        assert_eq!(under.read_file(Path::new("/dest/pack/b.md")).unwrap(), b"b");
        assert_eq!(under.read_file(Path::new("/dest/pack/a.md")).unwrap(), b"a");
    }

    #[test]
    fn a_preview_rename_reports_the_move_not_a_write_and_keeps_the_bit() {
        // A file the run wrote and then renamed lands once, at the new path,
        // as a move: `operations` carries the rename and `into_writes` does
        // not double-count the bytes it relocated.
        let under = MemVfs::new();
        under.create_dir_all(Path::new("/stage")).unwrap();

        let preview = PreviewVfs::over(&under);
        preview
            .write_file(Path::new("/stage/tool.sh"), b"#!/bin/sh\n")
            .unwrap();
        preview
            .set_executable(Path::new("/stage/tool.sh"), true)
            .unwrap();
        preview
            .rename(Path::new("/stage/tool.sh"), Path::new("/stage/run.sh"))
            .unwrap();

        assert!(!preview.exists(Path::new("/stage/tool.sh")));
        assert!(preview.is_executable(Path::new("/stage/run.sh")));
        assert_eq!(
            preview.operations(),
            vec![PlannedOp::Rename {
                from: PathBuf::from("/stage/tool.sh"),
                to: PathBuf::from("/stage/run.sh"),
            }]
        );
        assert!(preview.into_writes().is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn preview_is_symlink_answers_from_underneath_until_a_tombstone_lands() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("real")).unwrap();
        std::os::unix::fs::symlink(dir.path().join("real"), dir.path().join("link")).unwrap();

        let preview = PreviewVfs::over(&NativeVfs);
        assert!(preview.is_symlink(&dir.path().join("link")));

        // Once the preview removes it, the merged view has nothing there to
        // be a link — and the disk still does.
        preview.remove(&dir.path().join("link")).unwrap();
        assert!(!preview.is_symlink(&dir.path().join("link")));
        assert!(NativeVfs.is_symlink(&dir.path().join("link")));
    }

    #[test]
    fn the_default_canonicalize_folds_segments_and_asks_nothing() {
        // What a host with no link resolution answers: the lexical form, for a
        // path that need not exist.
        let vfs = MemVfs::new();
        assert_eq!(
            vfs.canonicalize(Path::new("/w/./notes/../notes/a.md"))
                .unwrap(),
            PathBuf::from("/w/notes/a.md")
        );
        assert_eq!(
            vfs.canonicalize(Path::new("/never/made")).unwrap(),
            PathBuf::from("/never/made")
        );
    }

    #[cfg(unix)]
    #[test]
    fn native_canonicalize_resolves_a_symlink_and_refuses_what_is_not_there() {
        let dir = tempfile::tempdir().unwrap();
        let vfs = NativeVfs;
        vfs.create_dir_all(&dir.path().join("real/inner")).unwrap();
        std::os::unix::fs::symlink(dir.path().join("real"), dir.path().join("link")).unwrap();

        // The whole point: two spellings, one location.
        assert_eq!(
            vfs.canonicalize(&dir.path().join("link/inner")).unwrap(),
            vfs.canonicalize(&dir.path().join("real/inner")).unwrap()
        );
        // Nothing to follow is an error, not a guess.
        assert!(vfs.canonicalize(&dir.path().join("real/absent")).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn preview_canonicalize_answers_from_the_tree_underneath() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("real")).unwrap();
        std::os::unix::fs::symlink(dir.path().join("real"), dir.path().join("link")).unwrap();

        let preview = PreviewVfs::over(&NativeVfs);
        assert_eq!(
            preview.canonicalize(&dir.path().join("link")).unwrap(),
            NativeVfs.canonicalize(&dir.path().join("real")).unwrap()
        );

        // A directory the preview invented is not on disk to resolve, so it
        // answers the same way it would before the preview ran. A containment
        // check reading this walks up to an ancestor that is really there.
        preview
            .create_dir_all(&dir.path().join("invented"))
            .unwrap();
        assert!(preview.exists(&dir.path().join("invented")));
        assert!(preview.canonicalize(&dir.path().join("invented")).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn native_read_dir_does_not_follow_a_symlinked_directory() {
        // `is_dir: false` is what stops the walk descending into it.
        let dir = tempfile::tempdir().unwrap();
        let vfs = NativeVfs;
        vfs.create_dir_all(&dir.path().join("real")).unwrap();
        std::os::unix::fs::symlink(dir.path().join("real"), dir.path().join("link")).unwrap();

        let listing = vfs.read_dir(dir.path()).unwrap();
        let link = listing.iter().find(|e| e.name == "link").unwrap();
        assert!(!link.is_dir);
    }

    /// `a/link/../peer` is `real/peer` on disk, where `link` points at
    /// `real/deep`. A preview must answer for that path as the tree underneath
    /// does, not for the textual fold `a/peer`.
    #[cfg(unix)]
    #[test]
    fn preview_asks_the_tree_underneath_about_a_parent_segment_behind_a_link() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().canonicalize().unwrap();
        std::fs::create_dir_all(root.join("real/deep")).unwrap();
        std::fs::create_dir_all(root.join("real/peer")).unwrap();
        std::fs::create_dir_all(root.join("a/peer")).unwrap();
        std::fs::create_dir_all(root.join("elsewhere")).unwrap();
        std::os::unix::fs::symlink(root.join("real/deep"), root.join("a/link")).unwrap();
        std::os::unix::fs::symlink(root.join("elsewhere"), root.join("real/linked")).unwrap();
        std::fs::create_dir_all(root.join("a/linked")).unwrap();

        let native = NativeVfs;
        let preview = PreviewVfs::over(&native);

        let peer = root.join("a/link/../peer");
        assert_eq!(native.canonicalize(&peer).unwrap(), root.join("real/peer"));
        assert_eq!(preview.canonicalize(&peer).unwrap(), root.join("real/peer"));

        let linked = root.join("a/link/../linked");
        assert!(native.is_symlink(&linked));
        assert!(preview.is_symlink(&linked));
    }

    #[cfg(unix)]
    #[test]
    fn preview_forwards_read_link_to_the_tree_underneath() {
        let tmp = tempfile::tempdir().unwrap();
        let link = tmp.path().join("dangling");
        std::os::unix::fs::symlink(tmp.path().join("missing/target.md"), &link).unwrap();

        let native = NativeVfs;
        let preview = PreviewVfs::over(&native);
        assert_eq!(
            preview.read_link(&link).unwrap(),
            tmp.path().join("missing/target.md")
        );
        assert!(preview.read_link(tmp.path()).is_err(), "not a link");
        assert!(MemVfs::new().read_link(tmp.path()).is_err(), "no links");
    }
}
