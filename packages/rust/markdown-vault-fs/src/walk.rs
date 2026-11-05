//! Vault walk with a **visibility policy**.
//!
//! A walk that hardcodes one rule — skip anything
//! starting with `.` or `_` — cannot serve both needs: media needs
//! `_attachments/`, notes must NOT see `_system/`. The rule becomes a parameter
//! and each capability names the policy it wants at the call site.
//!
//! The walk reads through a [`Vfs`], so the same rules hold on a disk, in a
//! test's in-memory tree and behind a wasm host. [`crate::native`] has the
//! one-line forms over the real filesystem.
//!
//! The traversal is [`vfs_walk`]'s. This module is the vault layer on it:
//! the visibility policy, the excluded files, notes versus attachments and
//! multi-root scoping become the filter it passes in.
//!
//! Entries come back in **tree order**: depth-first, and ordered within each
//! directory by name as a `String` (byte order). That is a stability
//! guarantee, not a collation one: the same vault always yields the same
//! sequence, and nothing more is promised. Callers that need a collation state
//! it themselves.
//!
//! # Excluded files by default
//!
//! Every walk applies the vault's excluded files ([`crate::hide`]), read from
//! `.obsidian/app.json`, unless the caller passes its own rules or turns them
//! off with [`Hide`]. `Everything` walks never apply them.

use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use vfs_seam::Vfs;
use vfs_walk::{Candidate, Errors, Symlinks};

use crate::hide::{self, HideRules};

/// Which entries a walk can see.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Visibility {
    /// Skip dot- AND underscore-prefixed entries. What notes, stats and the
    /// site pipeline want: `_system/` is configuration, not content.
    ContentNotes,
    /// Skip only dot-prefixed entries, so `_attachments/` is visible. What
    /// graph and media want.
    IncludingUnderscore,
    /// Skip nothing but `.git`. For backup and integrity sweeps.
    Everything,
}

impl Visibility {
    fn skips(&self, name: &str) -> bool {
        match self {
            Visibility::ContentNotes => name.starts_with('.') || name.starts_with('_'),
            Visibility::IncludingUnderscore => name.starts_with('.'),
            Visibility::Everything => name == ".git",
        }
    }

    /// Whether a vault-relative path is visible under this policy — the same
    /// per-component rule [`walk`] applies, asked of a path that did **not**
    /// come from a walk.
    ///
    /// A walk answers "what is in this vault"; a per-path read op is handed a
    /// path by a client and has to answer "is this something the vault
    /// surfaces at all". Containment cannot answer it: `.obsidian/`, `.git/`
    /// and `.trash/` are all *inside* the vault, and an op guarded by
    /// containment alone will serve a file the equivalent listing would never
    /// have shown. A host's asset endpoint is the case this
    /// exists for.
    ///
    /// Expects the normalised form [`crate::path::lexical::validate_relative`] returns
    /// — forward slashes, no empty / `.` / `..` segments. A backslash-
    /// separated path is treated as one component, which is why the guard runs
    /// *after* validation rather than instead of it.
    pub fn admits_path(&self, rel: &str) -> bool {
        !rel.split('/').any(|seg| self.skips(seg))
    }

    /// [`Self::admits_path`] with the vault's hide rules on top: a path
    /// under an excluded file or folder is not admitted. `Everything`
    /// ignores them, as the walk does.
    pub fn admits_path_hiding(&self, rel: &str, hide: &HideRules) -> bool {
        self.admits_path(rel) && (*self == Visibility::Everything || !hide.hides_path(rel, false))
    }
}

/// Which excluded-files list a walk applies.
#[derive(Debug, Clone, Default)]
pub enum Hide {
    /// The vault's own list, read from `.obsidian/app.json` at the start of
    /// the walk. A missing or unreadable file hides nothing.
    #[default]
    Vault,
    /// These rules, as the caller compiled them.
    Rules(Arc<HideRules>),
    /// Hide nothing beyond the visibility policy.
    Off,
}

/// What to collect.
#[derive(Debug, Clone)]
pub struct WalkOptions {
    /// Which dot- and underscore-prefixed entries the walk skips.
    pub visibility: Visibility,
    /// Collect `.md` notes.
    pub notes: bool,
    /// Collect non-`.md` files as attachments. `IncludingUnderscore` plus
    /// this is the graph/media combination.
    pub attachments: bool,
    /// Extension allowlist for attachments (lowercase, no dot). Empty means
    /// "any non-markdown file".
    pub attachment_extensions: Vec<String>,
    /// Substring exclusions, matched against the vault-relative path.
    ///
    /// SUBSTRING, not glob: user notes in the vault depend on the substring
    /// semantics the node scanners already have, and "fixing" it to globbing
    /// would silently change which files people's saved excludes match.
    pub exclude: Vec<String>,
    /// Skip files smaller than this. Use it to drop icons and other tiny images.
    pub min_bytes: u64,
    /// Vault-relative subtrees to walk, in precedence order. Empty — the
    /// default — walks the whole vault.
    ///
    /// A root of `.` is the vault root, and its entries are keyed identically
    /// to the same files reached by an explicit root or by the whole-vault
    /// walk: `CurDir` components are dropped, so nothing carries a `./`
    /// prefix that would both dirty the cache key and trip the hidden-segment
    /// filter.
    ///
    /// **First root wins.** Overlapping roots (`[_attachments,
    /// _attachments/2024]`) yield each file once, attributed to the first root
    /// that reached it, so a config note cannot double-count by nesting.
    pub roots: Vec<String>,
    /// The vault's excluded files ([`crate::hide`]), a layer on top of
    /// `visibility`. Hidden folders are pruned. Ignored under `Everything`,
    /// so backup and integrity walks see everything.
    pub hide: Hide,
    /// Fail the walk with [`WalkError::Symlink`] on a symlink the walk can
    /// see, instead of listing it. Off by default: a symlink is listed as a
    /// file (see [`Entry::is_symlink`]) and a symlinked folder is never
    /// entered.
    pub refuse_symlinks: bool,
    /// Fail the walk with [`WalkError::Io`] when a folder cannot be listed or
    /// a file cannot be statted. Off by default: a folder that cannot be
    /// listed yields nothing, and a file that cannot be statted is listed
    /// with size 0 and no time, so a projection survives one unreadable file.
    pub propagate_errors: bool,
    /// File and folder names skipped wherever they appear, such as
    /// `.DS_Store`. Exact, case-sensitive matches on the name alone.
    pub skip_names: Vec<String>,
    /// Folder names never entered, such as `.git`, `.obsidian`, `.trash` or
    /// `node_modules`. Exact, case-sensitive matches on the name alone. Only
    /// needed where the visibility policy lets the folder through (an
    /// `Everything` walk, or a name with no leading dot).
    pub prune_dirs: Vec<String>,
}

impl Default for WalkOptions {
    fn default() -> Self {
        WalkOptions {
            visibility: Visibility::ContentNotes,
            notes: true,
            attachments: false,
            attachment_extensions: Vec::new(),
            exclude: Vec::new(),
            min_bytes: 0,
            roots: Vec::new(),
            hide: Hide::Vault,
            refuse_symlinks: false,
            propagate_errors: false,
            skip_names: Vec::new(),
            prune_dirs: Vec::new(),
        }
    }
}

impl WalkOptions {
    /// notes / stats / sites: visible `.md` only.
    pub fn content_notes() -> Self {
        WalkOptions::default()
    }

    /// graph / media: notes plus attachments, `_attachments/` included.
    pub fn notes_and_attachments() -> Self {
        WalkOptions {
            visibility: Visibility::IncludingUnderscore,
            notes: true,
            attachments: true,
            ..Default::default()
        }
    }
}

/// One entry the walk found.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entry {
    /// Vault-relative, `/`-separated.
    pub rel: String,
    /// The vault directory joined with `rel`.
    pub abs: PathBuf,
    /// Whether the entry is a `.md` note, not an attachment.
    pub is_note: bool,
    /// Size in bytes.
    pub size: u64,
    /// Last modification in nanoseconds since the Unix epoch, from the same
    /// [`Vfs::metadata`] call that produced `size`, so an incremental cache
    /// can stamp `(size, mtime)` without a second stat per file. `None` when
    /// the host could not supply one, which a cache must treat as never
    /// fresh. [`Entry::mtime_ms_f64`] is node's `mtimeMs` for it.
    pub mtime_ns: Option<i64>,
    /// The walk does not follow links, so `size`/`mtime_ns` describe the
    /// LINK for a symlink entry. A cache that stamps file contents must
    /// re-stat these through the link.
    pub is_symlink: bool,
}

impl Entry {
    /// [`Entry::mtime_ns`] in whole milliseconds, rounded down.
    pub fn mtime_ms(&self) -> Option<i64> {
        self.mtime_ns.map(vfs_seam::ns_to_ms)
    }

    /// [`Entry::mtime_ns`] in fractional milliseconds, equal to node's
    /// `statSync().mtimeMs` ([`vfs_seam::ns_to_ms_f64`]).
    pub fn mtime_ms_f64(&self) -> Option<f64> {
        self.mtime_ns.map(vfs_seam::ns_to_ms_f64)
    }
}

/// A walk plus what it could not reach.
#[derive(Debug, Clone, Default)]
pub struct WalkOutcome {
    /// The entries found, in walk order.
    pub entries: Vec<Entry>,
    /// Configured roots that do not exist. Reported, never fatal: a vault
    /// legitimately lacks a root until the user creates it, and the UI says so
    /// rather than silently reporting zero files.
    pub missing_roots: Vec<String>,
}

/// Why a walk stopped. Only returned when [`WalkOptions::refuse_symlinks`]
/// or [`WalkOptions::propagate_errors`] asks for it. The same type as
/// `vfs-walk`'s.
pub use vfs_walk::WalkError;

/// Walk a vault through `vfs`, applying the visibility policy.
///
/// With the default options nothing fails: I/O errors on individual entries
/// are skipped, as a projection must survive one unreadable file exactly as
/// it must survive one malformed note. [`WalkOptions::refuse_symlinks`] and
/// [`WalkOptions::propagate_errors`] turn those into errors.
pub fn walk(vfs: &dyn Vfs, vault_dir: &Path, opts: &WalkOptions) -> Result<Vec<Entry>, WalkError> {
    Ok(walk_reporting(vfs, vault_dir, opts)?.entries)
}

/// [`walk`], additionally reporting configured roots that are not there.
///
/// The traversal is `vfs-walk`'s. This function turns the vault rules into
/// its filter: the visibility policy and the excluded files decide what the
/// vault shows, and the note, attachment and exclude options decide what this
/// walk collects.
pub fn walk_reporting(
    vfs: &dyn Vfs,
    vault_dir: &Path,
    opts: &WalkOptions,
) -> Result<WalkOutcome, WalkError> {
    let hide = opts.hide_rules(vfs, vault_dir);
    let hide = hide.as_deref();

    let rooted = !opts.roots.is_empty();
    // First root wins across overlapping roots. Only consulted on a rooted
    // walk: the whole-vault walk visits each file once.
    let seen = RefCell::new(HashSet::new());
    let collects = |rel: &str| -> bool {
        let name = rel.rsplit('/').next().unwrap_or(rel);
        opts.collects(rel, name) && (!rooted || seen.borrow_mut().insert(rel.to_owned()))
    };
    // A refused link fails the walk whatever it points at, so with links
    // refused the collect rules wait until the walk has looked at the file.
    // Otherwise they run first and spare the stat.
    let collect_early = !opts.refuse_symlinks;
    let filter = |c: &Candidate<'_>| {
        shows(opts.visibility, hide, rooted, c) && (c.is_dir || !collect_early || collects(c.rel))
    };
    let inner = vfs_walk::WalkOptions {
        skip_names: opts.skip_names.clone(),
        prune_dirs: opts.prune_dirs.clone(),
        filter: Some(&filter),
        symlinks: if opts.refuse_symlinks {
            Symlinks::Refuse
        } else {
            Symlinks::List
        },
        errors: if opts.propagate_errors {
            Errors::Propagate
        } else {
            Errors::Skip
        },
    };

    let mut subtrees = Vec::new();
    let mut missing_roots = Vec::new();
    if rooted {
        for root in &opts.roots {
            let rel = relative_root(root);
            // A root that climbs out of the vault yields nothing.
            if rel.split('/').any(|seg| seg == "..") {
                continue;
            }
            if !vfs.exists(&join_rel(vault_dir, &rel)) {
                missing_roots.push(root.clone());
                continue;
            }
            subtrees.push(rel);
        }
    } else {
        subtrees.push(String::new());
    }

    let mut entries = Vec::new();
    for sub in &subtrees {
        for found in vfs_walk::walk_subtree(vfs, vault_dir, sub, &inner)?.entries {
            if !collect_early && !collects(&found.rel) {
                continue;
            }
            if found.size < opts.min_bytes {
                continue;
            }
            let name = found.rel.rsplit('/').next().unwrap_or(&found.rel);
            entries.push(Entry {
                is_note: is_note(name),
                rel: found.rel,
                abs: found.abs,
                size: found.size,
                mtime_ns: found.mtime_ns,
                is_symlink: found.is_symlink,
            });
        }
    }

    // No sort here. The name order inside each folder already makes the
    // sequence deterministic; a collation is the caller's to declare. See the
    // module docs.
    Ok(WalkOutcome {
        entries,
        missing_roots,
    })
}

/// The content notes of a vault through `vfs`, as vault-relative paths.
/// Default options, so it cannot fail.
pub fn walk_notes(vfs: &dyn Vfs, vault_dir: &Path) -> Vec<String> {
    walk(vfs, vault_dir, &WalkOptions::content_notes())
        .unwrap_or_default()
        .into_iter()
        .map(|e| e.rel)
        .collect()
}

/// Whether the vault shows this file or folder: the visibility policy and the
/// excluded files. A folder it does not show is not entered.
///
/// The starting folder of a rooted walk is never asked about, and folders
/// above it are never visited, so for a file the whole vault-relative path is
/// checked again: a root inside a hidden or underscore folder cannot smuggle
/// in files the same policy hides anywhere else.
fn shows(
    visibility: Visibility,
    hide: Option<&HideRules>,
    rooted: bool,
    c: &Candidate<'_>,
) -> bool {
    if visibility.skips(c.name) {
        return false;
    }
    if c.is_dir {
        return hide.is_none_or(|h| !h.hides(c.rel, true));
    }
    if let Some(h) = hide {
        let hidden = if rooted {
            h.hides_path(c.rel, false)
        } else {
            h.hides(c.rel, false)
        };
        if hidden {
            return false;
        }
    }
    visibility.admits_path(c.rel)
}

fn is_note(name: &str) -> bool {
    name.to_lowercase().ends_with(".md")
}

/// What a walk makes of one path. See [`WalkOptions::admission`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Admission {
    /// The walk never lists this path, whatever is on disk. A cache ignores
    /// a change to it.
    Outside,
    /// The path is the walk's, but the walk would not list it now: it is
    /// gone, too small, a folder, a refused symlink, under a symlinked
    /// folder or a folder that cannot be listed, or spelled otherwise than
    /// its folder lists it. A cache drops it.
    Unlisted,
    /// The walk would list it. A cache reads it.
    Listed,
}

impl WalkOptions {
    /// The excluded-files rules this walk applies, read from the vault for
    /// [`Hide::Vault`]. `None` when it applies none: [`Hide::Off`], an empty
    /// list, or an `Everything` walk.
    fn hide_rules(&self, vfs: &dyn Vfs, vault_dir: &Path) -> Option<Arc<HideRules>> {
        if self.visibility == Visibility::Everything {
            return None;
        }
        match &self.hide {
            Hide::Vault => Some(hide::load(vfs, vault_dir).rules),
            Hide::Rules(rules) => Some(Arc::clone(rules)),
            Hide::Off => None,
        }
        .filter(|h| !h.is_empty())
    }

    /// What this walk makes of the file at vault-relative `rel`: the same
    /// rules [`walk`] applies, asked of a path that did not come from a walk.
    /// For a cache that is told a path changed and must decide whether to
    /// ignore it, drop it or read it.
    ///
    /// The roots, the skip and prune lists, the visibility policy, the
    /// excluded files (read from the vault for [`Hide::Vault`]), the exclude
    /// list and notes versus attachments decide [`Admission::Outside`]. Then
    /// the file system decides [`Admission::Unlisted`], as the walk reaches
    /// a file: by listing each folder from the walk's start down. A folder
    /// on the way that cannot be listed or is a symlink (never entered), or
    /// a file its folder does not list by that spelling (gone, or the old
    /// name after a case-only rename on a case-insensitive file system), is
    /// unlisted. So is a folder, a file under [`WalkOptions::min_bytes`] or
    /// a symlink under [`WalkOptions::refuse_symlinks`].
    ///
    /// It answers for one path. Under `refuse_symlinks` a whole walk fails
    /// on any symlink it sees, and under
    /// [`WalkOptions::propagate_errors`] on any error; neither is checked
    /// here.
    ///
    /// A file whose metadata cannot be read for another reason than being
    /// gone is what a walk that skips errors makes of it: listed with size 0
    /// and no time ([`Admission::Listed`]) when `min_bytes` is 0. Otherwise,
    /// and always under `propagate_errors`, it is [`Admission::Unlisted`].
    ///
    /// Each call lists the folders on the path; [`WalkOptions::admissions`]
    /// lists each folder once for the whole batch.
    ///
    /// Expects the normalised form [`crate::path::lexical::validate_relative`]
    /// returns. A path with an empty, `.` or `..` segment is outside.
    pub fn admission(&self, vfs: &dyn Vfs, vault_dir: &Path, rel: &str) -> Admission {
        let hide = self.hide_rules(vfs, vault_dir);
        let mut listings = Listings::default();
        self.admission_with(vfs, vault_dir, rel, hide.as_deref(), &mut listings)
    }

    /// Whether this walk would list the file at `rel` now:
    /// [`WalkOptions::admission`] is [`Admission::Listed`].
    pub fn admits(&self, vfs: &dyn Vfs, vault_dir: &Path, rel: &str) -> bool {
        self.admission(vfs, vault_dir, rel) == Admission::Listed
    }

    /// [`WalkOptions::admission`] for each of `rels`, in order, reading the
    /// excluded files once and each folder's listing once.
    pub fn admissions<'r>(
        &self,
        vfs: &dyn Vfs,
        vault_dir: &Path,
        rels: &'r [String],
    ) -> Vec<(&'r String, Admission)> {
        let hide = self.hide_rules(vfs, vault_dir);
        let mut listings = Listings::default();
        rels.iter()
            .map(|rel| {
                let admission =
                    self.admission_with(vfs, vault_dir, rel, hide.as_deref(), &mut listings);
                (rel, admission)
            })
            .collect()
    }

    /// Whether this walk reads its rules from the file at vault-relative
    /// `rel`: the vault's excluded files ([`hide::OBSIDIAN_APP_JSON`]) under
    /// [`Hide::Vault`], unless the walk sees `Everything`. A change to that
    /// file can change what the walk lists anywhere, which
    /// [`WalkOptions::admission`] cannot say path by path, so a cache walks
    /// again.
    pub fn reads_rules_from(&self, rel: &str) -> bool {
        matches!(self.hide, Hide::Vault)
            && self.visibility != Visibility::Everything
            && rel == hide::OBSIDIAN_APP_JSON
    }

    fn admission_with(
        &self,
        vfs: &dyn Vfs,
        vault_dir: &Path,
        rel: &str,
        hide: Option<&HideRules>,
        listings: &mut Listings,
    ) -> Admission {
        if rel
            .split('/')
            .any(|s| s.is_empty() || s == "." || s == "..")
            || !self.visibility.admits_path(rel)
            || hide.is_some_and(|h| h.hides_path(rel, false))
            || !self.collects(rel, rel.rsplit('/').next().unwrap_or(rel))
        {
            return Admission::Outside;
        }
        // Where the walk starts for each root `rel` is under by this walk's
        // rules. As in `vfs_walk`, the skip and prune lists apply below the
        // start. A root inside a pruned folder is still walked.
        let start_of = |root: &str| -> Option<usize> {
            let tail = if root.is_empty() {
                Some(rel)
            } else {
                rel.strip_prefix(root).and_then(|r| r.strip_prefix('/'))
            }?;
            let dirs = tail.rsplit_once('/').map_or("", |(dirs, _)| dirs);
            if tail
                .split('/')
                .any(|s| self.skip_names.iter().any(|n| n == s))
                || dirs
                    .split('/')
                    .any(|d| self.prune_dirs.iter().any(|n| n == d))
            {
                return None;
            }
            Some(rel.len() - tail.len())
        };
        let starts: Vec<usize> = if self.roots.is_empty() {
            start_of("").into_iter().collect()
        } else {
            self.roots
                .iter()
                .map(|r| relative_root(r))
                .filter(|root| !root.split('/').any(|seg| seg == ".."))
                .filter_map(|root| start_of(&root))
                .collect()
        };
        if starts.is_empty() {
            return Admission::Outside;
        }
        // The walk finds a file by listing each folder from its start down,
        // so a file is listed only when every one of them lists the next: a
        // folder it cannot list, a symlinked folder (listed as a file) or a
        // different spelling stops it.
        if !starts
            .iter()
            .any(|&start| listings.lists(vfs, vault_dir, rel, start))
        {
            return Admission::Unlisted;
        }
        match vfs.metadata(&join_rel(vault_dir, rel)) {
            Ok(m) if m.len >= self.min_bytes && !(m.is_symlink && self.refuse_symlinks) => {
                Admission::Listed
            }
            Ok(_) => Admission::Unlisted,
            // A walk that skips errors lists a file it cannot stat, with
            // size 0.
            Err(e) if !e.is_not_found() && !self.propagate_errors && self.min_bytes == 0 => {
                Admission::Listed
            }
            Err(_) => Admission::Unlisted,
        }
    }

    /// Whether this walk collects a file it can see: the exclude list, then
    /// notes versus attachments and the attachment extensions.
    fn collects(&self, rel: &str, name: &str) -> bool {
        if self
            .exclude
            .iter()
            .any(|x| !x.is_empty() && rel.contains(x.as_str()))
        {
            return false;
        }
        let is_note = is_note(name);
        if is_note {
            return self.notes;
        }
        if !self.attachments {
            return false;
        }
        if self.attachment_extensions.is_empty() {
            return true;
        }
        let ext = Path::new(name)
            .extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        self.attachment_extensions.contains(&ext)
    }
}

/// A configured root as a vault-relative path: `/`-separated, with `.` and
/// empty segments dropped, so `.` and `./x` key like the whole-vault walk.
fn relative_root(root: &str) -> String {
    root.split(['/', '\\'])
        .filter(|seg| !seg.is_empty() && *seg != ".")
        .collect::<Vec<_>>()
        .join("/")
}

/// Folder listings read for one admission or one batch: each folder's
/// entries as `(name, is_dir)`, `None` when it cannot be listed.
#[derive(Default)]
struct Listings(HashMap<PathBuf, Option<HashSet<(String, bool)>>>);

impl Listings {
    /// Whether listing each folder from the walk's start, `rel[..start]`,
    /// down to `rel`'s own folder finds `rel`: a folder for each segment but
    /// the last and a file for the last, spelled as `rel` spells it. How the
    /// walk reaches a file.
    fn lists(&mut self, vfs: &dyn Vfs, vault_dir: &Path, rel: &str, start: usize) -> bool {
        let mut folder = join_rel(vault_dir, &rel[..start]);
        let mut names = rel[start..].split('/').peekable();
        while let Some(name) = names.next() {
            let more = names.peek().is_some();
            let entries = self.0.entry(folder.clone()).or_insert_with(|| {
                let entries = vfs.read_dir(&folder).ok()?;
                Some(entries.into_iter().map(|e| (e.name, e.is_dir)).collect())
            });
            if !entries
                .as_ref()
                .is_some_and(|e| e.contains(&(name.to_string(), more)))
            {
                return false;
            }
            folder.push(name);
        }
        true
    }
}

/// `vault_dir` joined with each segment of a `/`-separated relative path.
fn join_rel(vault_dir: &Path, rel: &str) -> PathBuf {
    let mut path = vault_dir.to_path_buf();
    for seg in rel.split('/').filter(|s| !s.is_empty()) {
        path.push(seg);
    }
    path
}

#[cfg(test)]
mod tests {
    use super::*;
    use vfs_seam::MemVfs;

    const V: &str = "/v";

    fn fixture() -> MemVfs {
        let d = MemVfs::new();
        for (rel, body) in [
            ("Notes/alpha.md", "a"),
            ("Notes/beta.md", "b"),
            ("Notes/img.png", "0123456789"),
            ("_system/config.md", "c"),
            ("_attachments/photo.jpeg", "0123456789012345"),
            (".trash/gone.md", "g"),
            ("Zed/deep/note.md", "z"),
        ] {
            d.insert(Path::new(V).join(rel), body).unwrap();
        }
        d
    }

    fn mk(d: &MemVfs, rel: &str, body: &str) {
        d.insert(Path::new(V).join(rel), body).unwrap();
    }

    fn w(d: &MemVfs, opts: &WalkOptions) -> Vec<Entry> {
        walk(d, Path::new(V), opts).unwrap()
    }

    fn notes(d: &MemVfs) -> Vec<String> {
        walk_notes(d, Path::new(V))
    }

    #[test]
    fn content_notes_skips_dot_and_underscore() {
        let d = fixture();
        let got = notes(&d);
        assert_eq!(
            got,
            vec!["Notes/alpha.md", "Notes/beta.md", "Zed/deep/note.md"]
        );
    }

    #[test]
    fn graph_and_media_see_underscore_dirs_and_attachments() {
        let d = fixture();
        let got: Vec<_> = w(&d, &WalkOptions::notes_and_attachments())
            .into_iter()
            .map(|e| e.rel)
            .collect();
        assert!(got.contains(&"_attachments/photo.jpeg".to_string()));
        assert!(got.contains(&"_system/config.md".to_string()));
        assert!(got.contains(&"Notes/img.png".to_string()));
        assert!(
            !got.iter().any(|p| p.starts_with(".trash")),
            "dot dirs stay hidden"
        );
    }

    #[test]
    fn the_two_policies_genuinely_differ() {
        // The reason a single hardcoded rule cannot serve every caller.
        let d = fixture();
        let notes = w(&d, &WalkOptions::content_notes());
        let graph = w(&d, &WalkOptions::notes_and_attachments());
        assert!(graph.len() > notes.len());
    }

    #[test]
    fn attachment_extension_allowlist_applies() {
        let d = fixture();
        let opts = WalkOptions {
            attachment_extensions: vec!["jpeg".into()],
            ..WalkOptions::notes_and_attachments()
        };
        let got: Vec<_> = w(&d, &opts).into_iter().map(|e| e.rel).collect();
        assert!(got.contains(&"_attachments/photo.jpeg".to_string()));
        assert!(!got.contains(&"Notes/img.png".to_string()));
    }

    #[test]
    fn exclude_is_substring_matching_not_globbing() {
        let d = fixture();
        let opts = WalkOptions {
            exclude: vec!["Notes/".into()],
            ..WalkOptions::content_notes()
        };
        let got: Vec<_> = w(&d, &opts).into_iter().map(|e| e.rel).collect();
        assert_eq!(got, vec!["Zed/deep/note.md"]);

        // A bare substring matches mid-path, which a glob would not.
        let opts = WalkOptions {
            exclude: vec!["alph".into()],
            ..WalkOptions::content_notes()
        };
        let got: Vec<_> = w(&d, &opts).into_iter().map(|e| e.rel).collect();
        assert_eq!(got, vec!["Notes/beta.md", "Zed/deep/note.md"]);
    }

    #[test]
    fn min_bytes_drops_small_files() {
        let d = fixture();
        let opts = WalkOptions {
            min_bytes: 12,
            ..WalkOptions::notes_and_attachments()
        };
        let got: Vec<_> = w(&d, &opts).into_iter().map(|e| e.rel).collect();
        assert_eq!(got, vec!["_attachments/photo.jpeg"]);
    }

    #[test]
    fn everything_policy_still_hides_git() {
        let d = fixture();
        mk(&d, ".git/HEAD", "ref");
        let opts = WalkOptions {
            visibility: Visibility::Everything,
            attachments: true,
            ..Default::default()
        };
        let got: Vec<_> = w(&d, &opts).into_iter().map(|e| e.rel).collect();
        assert!(!got.iter().any(|p| p.starts_with(".git")));
        assert!(got.contains(&".trash/gone.md".to_string()));
    }

    #[test]
    fn the_order_is_deterministic() {
        let d = fixture();
        assert_eq!(notes(&d), notes(&d));
    }

    #[test]
    fn the_order_is_tree_order_not_a_collation() {
        // Tree order is not a collation: names sort as `String`s, by
        // BYTES, so `Zed` precedes `apple` and `z` precedes `é`. This walk promises
        // only that the sequence never varies; collations must be declared.
        let d = MemVfs::new();
        for rel in ["apple/note.md", "Zed/note.md", "é.md", "z.md"] {
            mk(&d, rel, "x");
        }
        assert_eq!(
            notes(&d),
            vec!["Zed/note.md", "apple/note.md", "z.md", "é.md"]
        );
    }

    fn rels(entries: Vec<Entry>) -> Vec<String> {
        entries.into_iter().map(|e| e.rel).collect()
    }

    fn attachments_in(roots: &[&str]) -> WalkOptions {
        WalkOptions {
            roots: roots.iter().map(|s| s.to_string()).collect(),
            ..WalkOptions::notes_and_attachments()
        }
    }

    #[test]
    fn roots_scope_the_walk_to_a_subtree() {
        let d = fixture();
        let got = rels(w(&d, &attachments_in(&["_attachments"])));
        assert_eq!(got, vec!["_attachments/photo.jpeg"]);
    }

    #[test]
    fn a_dot_root_is_the_whole_vault_and_keys_match_the_rootless_walk() {
        // The property the ocr/media whole-vault default depends on: `.` must
        // produce the same keys as no roots at all, with no `./` prefix.
        let d = fixture();
        let dot = rels(w(&d, &attachments_in(&["."])));
        let none = rels(w(&d, &WalkOptions::notes_and_attachments()));
        assert_eq!(dot, none);
        assert!(!dot.iter().any(|r| r.starts_with("./")), "{dot:?}");
    }

    #[test]
    fn overlapping_roots_yield_each_file_once() {
        // First root wins, so a config note nesting one root inside another
        // cannot double-count.
        let d = fixture();
        mk(&d, "_attachments/2024/scan.png", "0123456789");

        let got = rels(w(
            &d,
            &attachments_in(&["_attachments", "_attachments/2024"]),
        ));
        assert_eq!(
            got,
            vec!["_attachments/2024/scan.png", "_attachments/photo.jpeg"]
        );
    }

    #[test]
    fn a_missing_root_is_reported_rather_than_silently_empty() {
        let d = fixture();
        let out =
            walk_reporting(&d, Path::new(V), &attachments_in(&["_attachments", "nope"])).unwrap();
        assert_eq!(out.missing_roots, vec!["nope".to_string()]);
        assert_eq!(rels(out.entries), vec!["_attachments/photo.jpeg"]);
    }

    #[test]
    fn a_root_cannot_smuggle_in_files_the_policy_hides_elsewhere() {
        // A root pointing inside a hidden directory would otherwise bypass the
        // visibility rule: the walk starts BELOW the offending segment, so it
        // never sees it. The whole-path re-check is what closes that.
        let d = fixture();
        let got = rels(w(&d, &attachments_in(&[".trash"])));
        assert!(got.is_empty(), "{got:?}");
    }

    #[test]
    fn admits_path_answers_for_a_path_the_walk_never_produced() {
        // The property that makes it usable as a guard: for anything the walk
        // DID produce, the two agree by construction — so a per-path read op
        // and a listing cannot disagree about what the vault surfaces.
        let d = fixture();
        for policy in [
            Visibility::ContentNotes,
            Visibility::IncludingUnderscore,
            Visibility::Everything,
        ] {
            let opts = WalkOptions {
                visibility: policy,
                attachments: true,
                ..Default::default()
            };
            for entry in w(&d, &opts) {
                assert!(policy.admits_path(&entry.rel), "{policy:?} {}", entry.rel);
            }
        }
    }

    #[test]
    fn admits_path_hides_a_dot_dir_at_any_depth() {
        let p = Visibility::IncludingUnderscore;
        assert!(p.admits_path("assets/diagram.svg"));
        assert!(p.admits_path("_system/logo.png"), "underscore is visible");
        assert!(p.admits_path("_attachments/photo.jpeg"));
        // A dot component anywhere hides the path — the guard's whole job.
        assert!(!p.admits_path(".obsidian/workspace.json"));
        assert!(!p.admits_path(".trash/Deleted Note.md"));
        assert!(!p.admits_path(".git/config"));
        assert!(!p.admits_path("Notes/.hidden/x.png"));
        assert!(!p.admits_path("Notes/.env"));
        // A leading dot is not the same as a dot in the name.
        assert!(p.admits_path("Notes/v1.2 comparison.md"));
        assert!(p.admits_path("My ..dotfiles note.md"));
    }

    #[test]
    fn admits_path_tracks_each_policys_own_rule() {
        assert!(!Visibility::ContentNotes.admits_path("_system/config.md"));
        assert!(Visibility::IncludingUnderscore.admits_path("_system/config.md"));
        // `Everything` hides only `.git`, exactly as the walk does.
        assert!(Visibility::Everything.admits_path(".trash/gone.md"));
        assert!(!Visibility::Everything.admits_path(".git/HEAD"));
    }

    fn hiding(entries: &[&str], base: WalkOptions) -> WalkOptions {
        WalkOptions {
            hide: Hide::Rules(Arc::new(HideRules::parse(entries).0)),
            ..base
        }
    }

    #[test]
    fn hide_rules_drop_files_from_content_walks() {
        let d = fixture();
        let got = rels(w(&d, &hiding(&["Notes/"], WalkOptions::content_notes())));
        assert_eq!(got, vec!["Zed/deep/note.md"]);
        let got = rels(w(
            &d,
            &hiding(&["/beta/"], WalkOptions::notes_and_attachments()),
        ));
        assert!(!got.contains(&"Notes/beta.md".to_string()));
        assert!(got.contains(&"Notes/alpha.md".to_string()));
    }

    #[test]
    fn hide_rules_do_not_apply_to_everything_walks() {
        let d = fixture();
        let opts = hiding(
            &["Notes/"],
            WalkOptions {
                visibility: Visibility::Everything,
                attachments: true,
                ..Default::default()
            },
        );
        let got = rels(w(&d, &opts));
        assert!(got.contains(&"Notes/alpha.md".to_string()));
    }

    #[test]
    fn a_root_inside_a_hidden_folder_yields_nothing() {
        let d = fixture();
        let opts = hiding(
            &["zed/"],
            WalkOptions {
                roots: vec!["Zed/deep".into()],
                ..WalkOptions::content_notes()
            },
        );
        assert!(rels(w(&d, &opts)).is_empty());
    }

    #[test]
    fn admits_path_hiding_respects_the_rules() {
        let (hide, _) = HideRules::parse(&["Archive/"]);
        assert!(!Visibility::ContentNotes.admits_path_hiding("Archive/a.md", &hide));
        assert!(!Visibility::IncludingUnderscore.admits_path_hiding("Archive/x/b.png", &hide));
        assert!(Visibility::ContentNotes.admits_path_hiding("Notes/a.md", &hide));
        assert!(!Visibility::ContentNotes.admits_path_hiding("_system/a.md", &hide));
        assert!(Visibility::Everything.admits_path_hiding("Archive/a.md", &hide));
    }

    #[cfg(feature = "native")]
    #[test]
    fn a_relative_vault_root_walks_like_an_absolute_one() {
        // `cargo test` runs with the crate directory as the current directory.
        let got: Vec<String> = crate::native::walk(Path::new("."), &WalkOptions::content_notes())
            .unwrap()
            .into_iter()
            .map(|e| e.rel)
            .collect();
        assert!(got.contains(&"README.md".to_string()), "{got:?}");
    }

    #[test]
    fn the_vaults_own_excluded_files_apply_by_default() {
        let d = fixture();
        mk(
            &d,
            ".obsidian/app.json",
            r#"{"userIgnoreFilters":["Notes/"]}"#,
        );
        assert_eq!(notes(&d), vec!["Zed/deep/note.md"]);
        let off = WalkOptions {
            hide: Hide::Off,
            ..WalkOptions::content_notes()
        };
        assert_eq!(rels(w(&d, &off)).len(), 3);
        // Caller rules replace the vault's list.
        let mine = hiding(&["Zed/"], WalkOptions::content_notes());
        assert_eq!(rels(w(&d, &mine)), vec!["Notes/alpha.md", "Notes/beta.md"]);
    }

    #[test]
    fn a_broken_app_json_hides_nothing_and_does_not_stop_the_walk() {
        let d = fixture();
        mk(&d, ".obsidian/app.json", "{not json");
        assert_eq!(notes(&d).len(), 3);
    }

    #[test]
    fn skip_names_and_prune_dirs_drop_entries_by_name() {
        let d = fixture();
        mk(&d, "Notes/.DS_Store", "x");
        mk(&d, "node_modules/pkg/readme.md", "x");
        mk(&d, ".git/HEAD", "ref");
        let opts = WalkOptions {
            visibility: Visibility::Everything,
            attachments: true,
            skip_names: vec![".DS_Store".into()],
            prune_dirs: vec!["node_modules".into(), ".trash".into()],
            ..Default::default()
        };
        let got = rels(w(&d, &opts));
        assert!(!got.iter().any(|p| p.ends_with(".DS_Store")), "{got:?}");
        assert!(
            !got.iter().any(|p| p.starts_with("node_modules")),
            "{got:?}"
        );
        assert!(!got.iter().any(|p| p.starts_with(".trash")), "{got:?}");
        assert!(got.contains(&"Notes/alpha.md".to_string()));
        // A pruned name is a folder rule: a file of that name stays.
        mk(&d, "Notes/node_modules", "x");
        assert!(rels(w(&d, &opts)).contains(&"Notes/node_modules".to_string()));
    }

    #[test]
    fn entries_carry_the_vfs_size_and_time() {
        let d = fixture();
        d.set_modified_ns(&Path::new(V).join("Notes/alpha.md"), Some(1_234_500_000))
            .unwrap();
        let alpha = w(&d, &WalkOptions::content_notes())
            .into_iter()
            .find(|e| e.rel == "Notes/alpha.md")
            .unwrap();
        assert_eq!(alpha.size, 1);
        assert_eq!(alpha.mtime_ns, Some(1_234_500_000));
        assert_eq!(alpha.mtime_ms(), Some(1234));
        assert_eq!(alpha.mtime_ms_f64(), Some(1_234.5));
        assert_eq!(alpha.abs, Path::new(V).join("Notes").join("alpha.md"));
        assert!(!alpha.is_symlink);
    }

    #[test]
    fn a_missing_vault_is_empty_unless_errors_propagate() {
        let d = MemVfs::new();
        assert!(w(&d, &WalkOptions::content_notes()).is_empty());
        let strict = WalkOptions {
            propagate_errors: true,
            ..WalkOptions::content_notes()
        };
        assert!(matches!(
            walk(&d, Path::new(V), &strict),
            Err(WalkError::Io(e)) if e.is_not_found()
        ));
    }

    #[test]
    fn admits_agrees_with_the_walk_for_every_file() {
        let d = fixture();
        mk(&d, "node_modules/pkg/readme.md", "x");
        mk(&d, "Notes/.DS_Store", "x");
        mk(&d, "Archive/old.md", "x");
        mk(
            &d,
            ".obsidian/app.json",
            r#"{"userIgnoreFilters":["Archive/"]}"#,
        );
        let files = [
            "Notes/alpha.md",
            "Notes/beta.md",
            "Notes/img.png",
            "Notes/.DS_Store",
            "_system/config.md",
            "_attachments/photo.jpeg",
            ".trash/gone.md",
            ".obsidian/app.json",
            "Zed/deep/note.md",
            "node_modules/pkg/readme.md",
            "Archive/old.md",
        ];
        let everything = WalkOptions {
            visibility: Visibility::Everything,
            attachments: true,
            skip_names: vec![".DS_Store".into()],
            prune_dirs: vec!["node_modules".into(), ".obsidian".into()],
            ..Default::default()
        };
        for opts in [
            WalkOptions::content_notes(),
            WalkOptions::notes_and_attachments(),
            WalkOptions {
                hide: Hide::Off,
                ..WalkOptions::notes_and_attachments()
            },
            attachments_in(&["_attachments", "Zed"]),
            hiding(&["Zed/"], WalkOptions::content_notes()),
            WalkOptions {
                exclude: vec!["beta".into()],
                attachment_extensions: vec!["png".into()],
                ..WalkOptions::notes_and_attachments()
            },
            everything,
        ] {
            let walked = rels(w(&d, &opts));
            for rel in files {
                assert_eq!(
                    opts.admits(&d, Path::new(V), rel),
                    walked.iter().any(|w| w == rel),
                    "{rel} under {opts:?}"
                );
            }
            let all: Vec<String> = files.iter().map(|f| f.to_string()).collect();
            let listed = opts
                .admissions(&d, Path::new(V), &all)
                .into_iter()
                .filter(|(_, a)| *a == Admission::Listed)
                .count();
            assert_eq!(listed, walked.len(), "{opts:?}");
        }
        let notes = WalkOptions::content_notes();
        for bad in [
            "",
            "Notes//alpha.md",
            "./Notes/alpha.md",
            "../v/Notes/alpha.md",
        ] {
            assert!(!notes.admits(&d, Path::new(V), bad), "{bad}");
        }
    }

    /// A [`Vfs`] over a [`MemVfs`] that is denied one call on one path.
    struct Denied<'a> {
        inner: &'a MemVfs,
        path: PathBuf,
        /// `true`: the folder at `path` cannot be listed, as one searchable
        /// but not readable leaves it. `false`: the file at `path` cannot be
        /// statted, as a folder readable but not searchable leaves it.
        list: bool,
    }

    fn denied(path: &Path) -> vfs_seam::VfsError {
        let denied = std::io::Error::from(std::io::ErrorKind::PermissionDenied);
        vfs_seam::VfsError::io(path, denied)
    }

    impl Vfs for Denied<'_> {
        fn metadata(&self, path: &Path) -> Result<vfs_seam::Metadata, vfs_seam::VfsError> {
            if !self.list && path == self.path {
                return Err(denied(path));
            }
            self.inner.metadata(path)
        }
        fn read_file(&self, path: &Path) -> Result<Vec<u8>, vfs_seam::VfsError> {
            self.inner.read_file(path)
        }
        fn read_dir(&self, path: &Path) -> Result<Vec<vfs_seam::DirEntry>, vfs_seam::VfsError> {
            if self.list && path == self.path {
                return Err(denied(path));
            }
            self.inner.read_dir(path)
        }
        fn write_file(&self, path: &Path, bytes: &[u8]) -> Result<(), vfs_seam::VfsError> {
            self.inner.write_file(path, bytes)
        }
        fn create_dir_all(&self, path: &Path) -> Result<(), vfs_seam::VfsError> {
            self.inner.create_dir_all(path)
        }
        fn exists(&self, path: &Path) -> bool {
            self.inner.exists(path)
        }
        fn is_executable(&self, path: &Path) -> bool {
            self.inner.is_executable(path)
        }
        fn set_executable(&self, path: &Path, yes: bool) -> Result<(), vfs_seam::VfsError> {
            self.inner.set_executable(path, yes)
        }
        fn rename(&self, from: &Path, to: &Path) -> Result<(), vfs_seam::VfsError> {
            self.inner.rename(from, to)
        }
        fn remove(&self, path: &Path) -> Result<(), vfs_seam::VfsError> {
            self.inner.remove(path)
        }
    }

    #[test]
    fn admits_a_file_it_cannot_stat_as_the_walk_lists_it() {
        let d = fixture();
        let vfs = Denied {
            inner: &d,
            path: Path::new(V).join("Notes/alpha.md"),
            list: false,
        };
        let at = |opts: &WalkOptions, rel| opts.admission(&vfs, Path::new(V), rel);
        let lists = |opts: &WalkOptions| walk(&vfs, Path::new(V), opts).map(rels);

        // A walk that skips errors lists it with size 0 and no time.
        let notes = WalkOptions::content_notes();
        let alpha = walk(&vfs, Path::new(V), &notes)
            .unwrap()
            .into_iter()
            .find(|e| e.rel == "Notes/alpha.md")
            .expect("listed");
        assert_eq!((alpha.size, alpha.mtime_ns), (0, None));
        assert_eq!(at(&notes, "Notes/alpha.md"), Admission::Listed);
        let rooted = WalkOptions {
            roots: vec!["Notes".into()],
            ..WalkOptions::content_notes()
        };
        assert!(
            lists(&rooted)
                .unwrap()
                .contains(&"Notes/alpha.md".to_string())
        );
        assert_eq!(at(&rooted, "Notes/alpha.md"), Admission::Listed);

        // Size 0 is under any `min_bytes`.
        let sized = WalkOptions {
            min_bytes: 1,
            ..WalkOptions::content_notes()
        };
        assert!(
            !lists(&sized)
                .unwrap()
                .contains(&"Notes/alpha.md".to_string())
        );
        assert_eq!(at(&sized, "Notes/alpha.md"), Admission::Unlisted);

        // A walk that propagates errors fails on it.
        let strict = WalkOptions {
            propagate_errors: true,
            ..WalkOptions::content_notes()
        };
        assert!(lists(&strict).is_err());
        assert_eq!(at(&strict, "Notes/alpha.md"), Admission::Unlisted);

        // A gone file is still gone.
        assert_eq!(at(&notes, "Notes/deleted.md"), Admission::Unlisted);
    }

    #[test]
    fn admits_nothing_under_a_folder_it_cannot_list() {
        let d = fixture();
        mk(&d, "Zed/deep/note.md", "x");
        let vfs = Denied {
            inner: &d,
            path: Path::new(V).join("Zed"),
            list: true,
        };
        let rooted = WalkOptions {
            roots: vec!["Zed/deep".into()],
            ..WalkOptions::content_notes()
        };
        for opts in [WalkOptions::content_notes(), rooted.clone()] {
            let walked = rels(walk(&vfs, Path::new(V), &opts).unwrap());
            let rels: Vec<String> = vec!["Zed/deep/note.md".into(), "Notes/alpha.md".into()];
            let admitted: Vec<bool> = opts
                .admissions(&vfs, Path::new(V), &rels)
                .into_iter()
                .map(|(_, a)| a == Admission::Listed)
                .collect();
            let expected: Vec<bool> = rels.iter().map(|r| walked.contains(r)).collect();
            assert_eq!(admitted, expected, "{opts:?}");
            assert_eq!(
                opts.admits(&vfs, Path::new(V), "Zed/deep/note.md"),
                walked.contains(&"Zed/deep/note.md".to_string())
            );
        }
        // The rooted walk starts below the folder it cannot list.
        assert!(rooted.admits(&vfs, Path::new(V), "Zed/deep/note.md"));
        assert_eq!(
            WalkOptions::content_notes().admission(&vfs, Path::new(V), "Zed/deep/note.md"),
            Admission::Unlisted
        );
    }

    #[test]
    fn admits_only_the_spelling_its_folder_lists() {
        let d = fixture();
        let notes = WalkOptions::content_notes();
        // MemVfs is case-sensitive, so this stat fails; the folder listing
        // decides either way.
        assert_eq!(
            notes.admission(&d, Path::new(V), "Notes/Alpha.md"),
            Admission::Unlisted
        );
        assert_eq!(
            notes.admission(&d, Path::new(V), "Notes/alpha.md"),
            Admission::Listed
        );
    }

    #[cfg(unix)]
    #[test]
    fn admits_nothing_under_a_native_folder_it_cannot_list() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let v = dir.path();
        std::fs::create_dir(v.join("locked")).unwrap();
        std::fs::write(v.join("locked/a.md"), "x").unwrap();
        std::fs::write(v.join("open.md"), "x").unwrap();
        let mode = |m| std::fs::set_permissions(v.join("locked"), PermissionsExt::from_mode(m));
        // Searchable, not readable: a stat inside works, a listing fails.
        mode(0o311).unwrap();
        let listable = std::fs::read_dir(v.join("locked")).is_ok();
        let opts = WalkOptions::content_notes();
        let vfs = vfs_seam::NativeVfs;
        let walked = walk(&vfs, v, &opts).map(rels);
        let locked = opts.admission(&vfs, v, "locked/a.md");
        let open = opts.admission(&vfs, v, "open.md");
        mode(0o755).unwrap();
        if listable {
            return; // Running as root: permissions do not apply.
        }
        assert_eq!(walked.unwrap(), ["open.md"]);
        assert_eq!(locked, Admission::Unlisted);
        assert_eq!(open, Admission::Listed);
    }

    #[test]
    fn a_walk_reads_its_rules_from_the_excluded_files_only_when_it_applies_them() {
        let app = ".obsidian/app.json";
        assert!(WalkOptions::content_notes().reads_rules_from(app));
        assert!(!WalkOptions::content_notes().reads_rules_from("Notes/alpha.md"));
        let off = WalkOptions {
            hide: Hide::Off,
            ..WalkOptions::content_notes()
        };
        assert!(!off.reads_rules_from(app));
        let everything = WalkOptions {
            visibility: Visibility::Everything,
            ..WalkOptions::content_notes()
        };
        assert!(!everything.reads_rules_from(app), "it ignores them");
    }

    #[test]
    fn admits_reads_size_and_kind_from_the_vfs() {
        let d = fixture();
        let opts = WalkOptions {
            min_bytes: 10,
            ..WalkOptions::notes_and_attachments()
        };
        let walked = rels(w(&d, &opts));
        for rel in ["Notes/alpha.md", "Notes/img.png", "_attachments/photo.jpeg"] {
            assert_eq!(
                opts.admits(&d, Path::new(V), rel),
                walked.iter().any(|w| w == rel),
                "{rel}"
            );
        }
        // The walk's own path, but not listed now: a cache drops it.
        let at = |opts: &WalkOptions, rel| opts.admission(&d, Path::new(V), rel);
        assert_eq!(
            at(&opts, "Notes/alpha.md"),
            Admission::Unlisted,
            "too small"
        );
        assert_eq!(at(&opts, "Notes/deleted.md"), Admission::Unlisted, "gone");
        assert_eq!(at(&opts, "Notes/img.png"), Admission::Listed);
        assert_eq!(at(&opts, ".trash/x.md"), Admission::Outside);
        // A folder is not a file, whatever its name.
        mk(&d, "Folder.md/inner.md", "x");
        let notes = WalkOptions::content_notes();
        assert_eq!(at(&notes, "Folder.md"), Admission::Unlisted);
    }

    #[cfg(unix)]
    #[test]
    fn admits_follows_the_walk_on_symlinks() {
        use std::os::unix::fs::symlink;
        let dir = tempfile::tempdir().unwrap();
        let v = dir.path();
        std::fs::create_dir_all(v.join("real/sub")).unwrap();
        std::fs::write(v.join("real/sub/note.md"), "x").unwrap();
        symlink(v.join("real/sub/note.md"), v.join("real/link.md")).unwrap();
        symlink(v.join("real"), v.join("linked")).unwrap();
        let vfs = vfs_seam::NativeVfs;
        let listed = |opts: &WalkOptions| -> Vec<String> {
            walk(&vfs, v, opts).map(rels).unwrap_or_default()
        };

        let lists = WalkOptions::content_notes();
        assert_eq!(listed(&lists), ["real/link.md", "real/sub/note.md"]);
        assert!(lists.admits(&vfs, v, "real/link.md"));
        assert!(lists.admits(&vfs, v, "real/sub/note.md"));
        // Under a symlinked folder: never entered, so not listed.
        assert_eq!(
            lists.admission(&vfs, v, "linked/sub/note.md"),
            Admission::Unlisted
        );

        // A walk that refuses symlinks fails on one, so none is admitted.
        let refuses = WalkOptions {
            refuse_symlinks: true,
            ..WalkOptions::content_notes()
        };
        assert!(walk(&vfs, v, &refuses).is_err());
        assert_eq!(
            refuses.admission(&vfs, v, "real/link.md"),
            Admission::Unlisted
        );
        assert!(refuses.admits(&vfs, v, "real/sub/note.md"));

        // A root that is itself a symlinked folder is entered.
        let rooted = WalkOptions {
            roots: vec!["linked".into()],
            ..WalkOptions::content_notes()
        };
        assert!(listed(&rooted).contains(&"linked/sub/note.md".to_string()));
        assert!(rooted.admits(&vfs, v, "linked/sub/note.md"));
    }

    #[test]
    fn admits_walks_a_root_inside_a_pruned_folder() {
        let d = fixture();
        mk(&d, "node_modules/pkg/readme.md", "x");
        mk(&d, "node_modules/pkg/node_modules/dep/readme.md", "x");
        mk(&d, "node_modules/pkg/.DS_Store.md", "x");
        let opts = WalkOptions {
            roots: vec!["node_modules/pkg".into()],
            skip_names: vec![".DS_Store.md".into()],
            prune_dirs: vec!["node_modules".into()],
            ..WalkOptions::content_notes()
        };
        let walked = rels(w(&d, &opts));
        assert_eq!(walked, ["node_modules/pkg/readme.md"]);
        for rel in [
            "node_modules/pkg/readme.md",
            "node_modules/pkg/node_modules/dep/readme.md",
            "node_modules/pkg/.DS_Store.md",
            "Notes/alpha.md",
        ] {
            assert_eq!(
                opts.admits(&d, Path::new(V), rel),
                walked.iter().any(|w| w == rel),
                "{rel}"
            );
        }
    }

    #[test]
    fn a_root_that_climbs_out_yields_nothing() {
        let d = fixture();
        assert!(rels(w(&d, &attachments_in(&["../v"]))).is_empty());
    }

    #[cfg(all(unix, feature = "native"))]
    #[test]
    fn a_symlink_is_listed_by_default_and_refused_on_request() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join("real.md"), "x").unwrap();
        std::os::unix::fs::symlink(d.path().join("real.md"), d.path().join("link.md")).unwrap();
        std::fs::create_dir(d.path().join("dir")).unwrap();
        std::fs::write(d.path().join("dir/inner.md"), "x").unwrap();
        std::os::unix::fs::symlink(d.path().join("dir"), d.path().join("dirlink")).unwrap();

        let entries = crate::native::walk(d.path(), &WalkOptions::content_notes()).unwrap();
        let link = entries.iter().find(|e| e.rel == "link.md").unwrap();
        assert!(link.is_symlink);
        // A linked folder is never entered.
        assert!(!entries.iter().any(|e| e.rel.starts_with("dirlink/")));

        let strict = WalkOptions {
            refuse_symlinks: true,
            ..WalkOptions::content_notes()
        };
        let err = crate::native::walk(d.path(), &strict).unwrap_err();
        assert!(matches!(err, WalkError::Symlink(_)), "{err}");

        // A refused link fails the walk even when the walk would not collect
        // it: a notes-only walk still refuses a linked image.
        std::fs::remove_file(d.path().join("link.md")).unwrap();
        std::fs::remove_file(d.path().join("dirlink")).unwrap();
        std::os::unix::fs::symlink(d.path().join("real.md"), d.path().join("link.png")).unwrap();
        let err = crate::native::walk(d.path(), &strict).unwrap_err();
        assert!(matches!(err, WalkError::Symlink(_)), "{err}");
        // Without refusal the notes-only walk does not list it.
        let entries = crate::native::walk(d.path(), &WalkOptions::content_notes()).unwrap();
        assert!(!entries.iter().any(|e| e.rel == "link.png"));
    }
}
