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

use std::path::{Path, PathBuf};
use std::sync::Arc;

use vfs_seam::{Vfs, VfsError};

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
    /// a file cannot be statted. Off by default: the entry is skipped, so a
    /// projection survives one unreadable file.
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
    /// Last modification in milliseconds since the Unix epoch, from the same
    /// [`Vfs::metadata`] call that produced `size`, so an incremental cache
    /// can stamp `(size, mtime)` without a second stat per file. `None` when
    /// the host could not supply one, which a cache must treat as never
    /// fresh.
    pub mtime_ms: Option<i64>,
    /// The walk does not follow links, so `size`/`mtime_ms` describe the
    /// LINK for a symlink entry. A cache that stamps file contents must
    /// re-stat these through the link.
    pub is_symlink: bool,
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
/// or [`WalkOptions::propagate_errors`] asks for it.
#[derive(Debug, thiserror::Error)]
pub enum WalkError {
    /// A symlink, with `refuse_symlinks` on.
    #[error("{}: a symlink, and this walk refuses them", .0.display())]
    Symlink(PathBuf),
    /// A folder that could not be listed or a file that could not be
    /// statted, with `propagate_errors` on.
    #[error(transparent)]
    Io(#[from] VfsError),
}

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
pub fn walk_reporting(
    vfs: &dyn Vfs,
    vault_dir: &Path,
    opts: &WalkOptions,
) -> Result<WalkOutcome, WalkError> {
    let loaded;
    let hide: Option<&HideRules> = if opts.visibility == Visibility::Everything {
        None
    } else {
        match &opts.hide {
            Hide::Vault => {
                loaded = hide::load(vfs, vault_dir).rules;
                Some(loaded.as_ref())
            }
            Hide::Rules(rules) => Some(rules.as_ref()),
            Hide::Off => None,
        }
    }
    .filter(|h| !h.is_empty());

    let mut walker = Walker {
        vfs,
        vault_dir,
        opts,
        hide,
        seen: std::collections::HashSet::new(),
        out: Vec::new(),
        dedupe: false,
    };
    let mut missing_roots = Vec::new();

    if opts.roots.is_empty() {
        walker.dir(vault_dir, "")?;
    } else {
        walker.dedupe = true;
        for root in &opts.roots {
            let rel = relative_root(root);
            // A root that climbs out of the vault yields nothing.
            if rel.split('/').any(|seg| seg == "..") {
                continue;
            }
            let root_dir = join_rel(vault_dir, &rel);
            if !vfs.exists(&root_dir) {
                missing_roots.push(root.clone());
                continue;
            }
            walker.dir(&root_dir, &rel)?;
        }
    }

    // No sort here. The name order inside each folder already makes the
    // sequence deterministic; a collation is the caller's to declare. See the
    // module docs.
    Ok(WalkOutcome {
        entries: walker.out,
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

/// One walk's state.
struct Walker<'a> {
    vfs: &'a dyn Vfs,
    vault_dir: &'a Path,
    opts: &'a WalkOptions,
    hide: Option<&'a HideRules>,
    /// First-root-wins across overlapping roots. Only consulted when
    /// `dedupe` is on: the whole-vault walk visits each file once.
    seen: std::collections::HashSet<String>,
    out: Vec<Entry>,
    dedupe: bool,
}

impl Walker<'_> {
    /// Lists `dir` (vault-relative `rel`, empty for the vault root) and
    /// visits its entries in name order. The starting folder's own name is
    /// not judged: a configured root that is hidden or underscore-prefixed is
    /// the user's explicit choice, so the policy applies only to what is
    /// inside it.
    fn dir(&mut self, dir: &Path, rel: &str) -> Result<(), WalkError> {
        let mut entries = match self.vfs.read_dir(dir) {
            Ok(entries) => entries,
            Err(e) if self.opts.propagate_errors => return Err(e.into()),
            Err(_) => return Ok(()),
        };
        entries.sort_by(|a, b| a.name.cmp(&b.name));
        for entry in entries {
            let name = entry.name;
            if self.opts.visibility.skips(&name) || self.opts.skip_names.contains(&name) {
                continue;
            }
            let child_rel = if rel.is_empty() {
                name.clone()
            } else {
                format!("{rel}/{name}")
            };
            let path = dir.join(&name);
            if entry.is_dir {
                if self.opts.prune_dirs.contains(&name) {
                    continue;
                }
                if let Some(hide) = self.hide
                    && hide.hides(&child_rel, true)
                {
                    continue;
                }
                self.dir(&path, &child_rel)?;
            } else {
                self.file(&path, child_rel, &name)?;
            }
        }
        Ok(())
    }

    fn file(&mut self, path: &Path, rel: String, name: &str) -> Result<(), WalkError> {
        let opts = self.opts;
        // Folders above a root are never visited, so a rooted walk checks them here.
        if let Some(hide) = self.hide {
            let hidden = if self.dedupe {
                hide.hides_path(&rel, false)
            } else {
                hide.hides(&rel, false)
            };
            if hidden {
                return Ok(());
            }
        }
        // A root can sit inside a hidden or underscore subtree, in which case
        // the walk above never sees the offending segment. Re-check the whole
        // vault-relative path so a root cannot smuggle in files the same
        // policy would hide anywhere else.
        if !opts.visibility.admits_path(&rel) {
            return Ok(());
        }
        // Asked before the kind filters when links are refused, so a refused
        // link fails the walk whatever it points at.
        let mut meta = None;
        if opts.refuse_symlinks {
            let m = self.stat(path)?;
            if m.is_some_and(|m| m.is_symlink) {
                return Err(WalkError::Symlink(path.to_path_buf()));
            }
            meta = Some(m);
        }
        if opts
            .exclude
            .iter()
            .any(|x| !x.is_empty() && rel.contains(x.as_str()))
        {
            return Ok(());
        }
        let is_note = name.to_lowercase().ends_with(".md");
        if is_note && !opts.notes {
            return Ok(());
        }
        if !is_note {
            if !opts.attachments {
                return Ok(());
            }
            if !opts.attachment_extensions.is_empty() {
                let ext = Path::new(name)
                    .extension()
                    .map(|e| e.to_string_lossy().to_lowercase())
                    .unwrap_or_default();
                if !opts.attachment_extensions.contains(&ext) {
                    return Ok(());
                }
            }
        }
        if self.dedupe && !self.seen.insert(rel.clone()) {
            return Ok(());
        }
        let meta = match meta {
            Some(m) => m,
            None => self.stat(path)?,
        };
        let (size, mtime_ms, is_symlink) = meta
            .map(|m| (m.len, m.modified_ms, m.is_symlink))
            .unwrap_or((0, None, false));
        if size < opts.min_bytes {
            return Ok(());
        }
        self.out.push(Entry {
            abs: join_rel(self.vault_dir, &rel),
            rel,
            is_note,
            size,
            mtime_ms,
            is_symlink,
        });
        Ok(())
    }

    /// The entry's metadata; `None` for a stat that failed and is skipped.
    fn stat(&self, path: &Path) -> Result<Option<vfs_seam::Metadata>, WalkError> {
        match self.vfs.metadata(path) {
            Ok(m) => Ok(Some(m)),
            Err(e) if self.opts.propagate_errors => Err(e.into()),
            Err(_) => Ok(None),
        }
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
        d.set_modified(&Path::new(V).join("Notes/alpha.md"), Some(1234))
            .unwrap();
        let alpha = w(&d, &WalkOptions::content_notes())
            .into_iter()
            .find(|e| e.rel == "Notes/alpha.md")
            .unwrap();
        assert_eq!(alpha.size, 1);
        assert_eq!(alpha.mtime_ms, Some(1234));
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
    }
}
