//! Vault walk with a **visibility policy**.
//!
//! A walk that hardcodes one rule — skip anything
//! starting with `.` or `_` — cannot serve both needs: media needs
//! `_attachments/`, notes must NOT see `_system/`. The rule becomes a parameter
//! and each capability names the policy it wants at the call site.
//!
//! Entries come back in **tree order** — depth-first, name-ordered within each
//! directory, which is what `walkdir`'s `sort_by_file_name` gives. That is a
//! stability guarantee, not a collation one: the same vault always yields the
//! same sequence, and nothing more is promised. Callers that need a collation
//! state it themselves.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::hide::HideRules;
use crate::path::lexical::to_relative;

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
    /// Follow symbolic links. Off by default; see [`Entry::is_symlink`].
    pub follow_links: bool,
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
    pub hide: Option<Arc<HideRules>>,
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
            follow_links: false,
            roots: Vec::new(),
            hide: None,
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
    /// Absolute path on disk.
    pub abs: PathBuf,
    /// Whether the entry is a `.md` note, not an attachment.
    pub is_note: bool,
    /// Size in bytes.
    pub size: u64,
    /// From the same metadata call that produced `size`, so an incremental
    /// cache can stamp `(size, mtime)` without a second stat per file. `None`
    /// when the platform or the stat could not supply one — which a cache must
    /// treat as never-fresh.
    pub mtime: Option<std::time::SystemTime>,
    /// The walk does not follow links (unless asked), so `size`/`mtime`
    /// describe the LINK for a symlink entry. A cache that stamps file
    /// contents must re-stat these through the link.
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

/// Walk a vault, applying the visibility policy.
///
/// I/O errors on individual entries are skipped rather than propagated: a
/// projection must survive one unreadable file, exactly as it must survive
/// one malformed note.
pub fn walk(vault_dir: &Path, opts: &WalkOptions) -> Vec<Entry> {
    walk_reporting(vault_dir, opts).entries
}

/// [`walk`], additionally reporting configured roots that are not there.
///
/// Separate entry point rather than a changed return type: every existing
/// caller walks the whole vault, where "missing root" cannot happen.
pub fn walk_reporting(vault_dir: &Path, opts: &WalkOptions) -> WalkOutcome {
    // The path guard reads no current directory, so the vault root is made
    // absolute once here and a relative root walks the same as an absolute one.
    let absolute_dir = std::path::absolute(vault_dir).unwrap_or_else(|_| vault_dir.to_path_buf());
    let vault_dir = absolute_dir.as_path();
    let mut out = Vec::new();
    let mut missing_roots = Vec::new();
    // `seen` enforces first-root-wins across overlapping roots. Only needed
    // when roots are configured; the whole-vault walk visits each file once.
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();

    if opts.roots.is_empty() {
        walk_one(vault_dir, vault_dir, opts, &mut seen, &mut out, false);
    } else {
        for root in &opts.roots {
            let root_dir = vault_dir.join(root);
            if !root_dir.exists() {
                missing_roots.push(root.clone());
                continue;
            }
            walk_one(vault_dir, &root_dir, opts, &mut seen, &mut out, true);
        }
    }

    // No sort here. `sort_by_file_name` on the traversal already makes the
    // sequence deterministic; a collation is the caller's to declare. See the
    // module docs.
    WalkOutcome {
        entries: out,
        missing_roots,
    }
}

/// One traversal, from `start` but keyed relative to `vault_dir`.
///
/// `dedupe` is on only for multi-root walks, so the whole-vault path does not
/// pay for a hash set it cannot need.
fn walk_one(
    vault_dir: &Path,
    start: &Path,
    opts: &WalkOptions,
    seen: &mut std::collections::HashSet<String>,
    out: &mut Vec<Entry>,
    dedupe: bool,
) {
    let hide = opts
        .hide
        .as_deref()
        .filter(|h| opts.visibility != Visibility::Everything && !h.is_empty());
    let mut walker = walkdir::WalkDir::new(start)
        .follow_links(opts.follow_links)
        .sort_by_file_name()
        .into_iter();

    loop {
        let entry = match walker.next() {
            None => break,
            Some(Err(_)) => continue,
            Some(Ok(e)) => e,
        };
        // Depth 0 is the start directory itself. A configured root that is
        // hidden or underscore-prefixed is the user's explicit choice, so the
        // visibility policy is not applied to it — only to what is inside.
        if entry.depth() == 0 {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if opts.visibility.skips(&name) {
            if entry.file_type().is_dir() {
                walker.skip_current_dir();
            }
            continue;
        }
        if entry.file_type().is_dir() {
            if let Some(hide) = hide
                && to_relative(vault_dir, entry.path()).is_ok_and(|rel| hide.hides(&rel, true))
            {
                walker.skip_current_dir();
            }
            continue;
        }
        let Ok(rel) = to_relative(vault_dir, entry.path()) else {
            continue;
        };
        // Folders above a root are never visited, so a rooted walk checks them here.
        if let Some(hide) = hide {
            let hidden = if dedupe {
                hide.hides_path(&rel, false)
            } else {
                hide.hides(&rel, false)
            };
            if hidden {
                continue;
            }
        }
        // A root can sit inside a hidden or underscore subtree, in which case
        // the walk above never sees the offending segment. Re-check the whole
        // vault-relative path so a root cannot smuggle in files the same
        // policy would hide anywhere else.
        if !opts.visibility.admits_path(&rel) {
            continue;
        }
        if opts
            .exclude
            .iter()
            .any(|x| !x.is_empty() && rel.contains(x.as_str()))
        {
            continue;
        }
        let is_note = name.to_lowercase().ends_with(".md");
        if is_note && !opts.notes {
            continue;
        }
        if !is_note {
            if !opts.attachments {
                continue;
            }
            if !opts.attachment_extensions.is_empty() {
                let ext = Path::new(&name)
                    .extension()
                    .map(|e| e.to_string_lossy().to_lowercase())
                    .unwrap_or_default();
                if !opts.attachment_extensions.contains(&ext) {
                    continue;
                }
            }
        }
        if dedupe && !seen.insert(rel.clone()) {
            continue;
        }
        let (size, mtime) = entry
            .metadata()
            .map(|m| (m.len(), m.modified().ok()))
            .unwrap_or((0, None));
        if size < opts.min_bytes {
            continue;
        }
        out.push(Entry {
            rel,
            abs: entry.path().to_path_buf(),
            is_note,
            size,
            mtime,
            is_symlink: entry.file_type().is_symlink(),
        });
    }
}

/// The one-line form of [`walk`] for the common case: the content notes of a
/// vault, as vault-relative paths.
pub fn walk_notes(vault_dir: &Path) -> Vec<String> {
    walk(vault_dir, &WalkOptions::content_notes())
        .into_iter()
        .map(|e| e.rel)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> tempfile::TempDir {
        let d = tempfile::tempdir().unwrap();
        let mk = |rel: &str, body: &str| {
            let p = d.path().join(rel);
            std::fs::create_dir_all(p.parent().unwrap()).unwrap();
            std::fs::write(p, body).unwrap();
        };
        mk("Notes/alpha.md", "a");
        mk("Notes/beta.md", "b");
        mk("Notes/img.png", "0123456789");
        mk("_system/config.md", "c");
        mk("_attachments/photo.jpeg", "0123456789012345");
        mk(".trash/gone.md", "g");
        mk("Zed/deep/note.md", "z");
        d
    }

    #[test]
    fn content_notes_skips_dot_and_underscore() {
        let d = fixture();
        let got = walk_notes(d.path());
        assert_eq!(
            got,
            vec!["Notes/alpha.md", "Notes/beta.md", "Zed/deep/note.md"]
        );
    }

    #[test]
    fn graph_and_media_see_underscore_dirs_and_attachments() {
        let d = fixture();
        let got: Vec<_> = walk(d.path(), &WalkOptions::notes_and_attachments())
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
        let notes = walk(d.path(), &WalkOptions::content_notes());
        let graph = walk(d.path(), &WalkOptions::notes_and_attachments());
        assert!(graph.len() > notes.len());
    }

    #[test]
    fn attachment_extension_allowlist_applies() {
        let d = fixture();
        let opts = WalkOptions {
            attachment_extensions: vec!["jpeg".into()],
            ..WalkOptions::notes_and_attachments()
        };
        let got: Vec<_> = walk(d.path(), &opts).into_iter().map(|e| e.rel).collect();
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
        let got: Vec<_> = walk(d.path(), &opts).into_iter().map(|e| e.rel).collect();
        assert_eq!(got, vec!["Zed/deep/note.md"]);

        // A bare substring matches mid-path, which a glob would not.
        let opts = WalkOptions {
            exclude: vec!["alph".into()],
            ..WalkOptions::content_notes()
        };
        let got: Vec<_> = walk(d.path(), &opts).into_iter().map(|e| e.rel).collect();
        assert_eq!(got, vec!["Notes/beta.md", "Zed/deep/note.md"]);
    }

    #[test]
    fn min_bytes_drops_small_files() {
        let d = fixture();
        let opts = WalkOptions {
            min_bytes: 12,
            ..WalkOptions::notes_and_attachments()
        };
        let got: Vec<_> = walk(d.path(), &opts).into_iter().map(|e| e.rel).collect();
        assert_eq!(got, vec!["_attachments/photo.jpeg"]);
    }

    #[test]
    fn everything_policy_still_hides_git() {
        let d = fixture();
        std::fs::create_dir_all(d.path().join(".git")).unwrap();
        std::fs::write(d.path().join(".git/HEAD"), "ref").unwrap();
        let opts = WalkOptions {
            visibility: Visibility::Everything,
            attachments: true,
            ..Default::default()
        };
        let got: Vec<_> = walk(d.path(), &opts).into_iter().map(|e| e.rel).collect();
        assert!(!got.iter().any(|p| p.starts_with(".git")));
        assert!(got.contains(&".trash/gone.md".to_string()));
    }

    #[test]
    fn the_order_is_deterministic() {
        let d = fixture();
        assert_eq!(walk_notes(d.path()), walk_notes(d.path()));
    }

    #[test]
    fn the_order_is_tree_order_not_a_collation() {
        // Tree order is not a collation: `walkdir`'s `sort_by_file_name`
        // orders by BYTES, so `Zed` precedes `apple`. This walk promises
        // only that the sequence never varies; collations must be declared.
        let d = tempfile::tempdir().unwrap();
        for rel in ["Zed/note.md", "apple/note.md"] {
            let p = d.path().join(rel);
            std::fs::create_dir_all(p.parent().unwrap()).unwrap();
            std::fs::write(p, "x").unwrap();
        }
        assert_eq!(walk_notes(d.path()), vec!["Zed/note.md", "apple/note.md"]);
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
        let got = rels(walk(d.path(), &attachments_in(&["_attachments"])));
        assert_eq!(got, vec!["_attachments/photo.jpeg"]);
    }

    #[test]
    fn a_dot_root_is_the_whole_vault_and_keys_match_the_rootless_walk() {
        // The property the ocr/media whole-vault default depends on: `.` must
        // produce the same keys as no roots at all, with no `./` prefix.
        let d = fixture();
        let dot = rels(walk(d.path(), &attachments_in(&["."])));
        let none = rels(walk(d.path(), &WalkOptions::notes_and_attachments()));
        assert_eq!(dot, none);
        assert!(!dot.iter().any(|r| r.starts_with("./")), "{dot:?}");
    }

    #[test]
    fn overlapping_roots_yield_each_file_once() {
        // First root wins, so a config note nesting one root inside another
        // cannot double-count.
        let d = fixture();
        std::fs::create_dir_all(d.path().join("_attachments/2024")).unwrap();
        std::fs::write(d.path().join("_attachments/2024/scan.png"), "0123456789").unwrap();

        let got = rels(walk(
            d.path(),
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
        let out = walk_reporting(d.path(), &attachments_in(&["_attachments", "nope"]));
        assert_eq!(out.missing_roots, vec!["nope".to_string()]);
        assert_eq!(rels(out.entries), vec!["_attachments/photo.jpeg"]);
    }

    #[test]
    fn a_root_cannot_smuggle_in_files_the_policy_hides_elsewhere() {
        // A root pointing inside a hidden directory would otherwise bypass the
        // visibility rule: the walk starts BELOW the offending segment, so it
        // never sees it. The whole-path re-check is what closes that.
        let d = fixture();
        let got = rels(walk(d.path(), &attachments_in(&[".trash"])));
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
            for entry in walk(d.path(), &opts) {
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
            hide: Some(Arc::new(HideRules::parse(entries).0)),
            ..base
        }
    }

    #[test]
    fn hide_rules_drop_files_from_content_walks() {
        let d = fixture();
        let got = rels(walk(
            d.path(),
            &hiding(&["Notes/"], WalkOptions::content_notes()),
        ));
        assert_eq!(got, vec!["Zed/deep/note.md"]);
        let got = rels(walk(
            d.path(),
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
        let got = rels(walk(d.path(), &opts));
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
        assert!(rels(walk(d.path(), &opts)).is_empty());
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

    #[test]
    fn a_relative_vault_root_walks_like_an_absolute_one() {
        // `cargo test` runs with the crate directory as the current directory.
        let got: Vec<String> = walk(Path::new("."), &WalkOptions::content_notes())
            .into_iter()
            .map(|e| e.rel)
            .collect();
        assert!(got.contains(&"README.md".to_string()), "{got:?}");
    }
}
