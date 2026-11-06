//! The link graph: out-edges, backlinks and inline tags, off one incremental
//! walk.
//!
//! [`LinkGraph`] walks every file a link can point at (notes and
//! attachments, `_system/` and the corpus's excluded files included, as
//! Obsidian resolves links to them), reads each note's body once, and keeps
//! [`NoteFacts`] for it: outgoing links with spans and lines, frontmatter
//! links, and inline tags. It inverts the edges into a backlink map at the
//! end of each sweep, so "what links here" is a lookup.
//!
//! # The walk
//!
//! [`LinkGraph::default_walk`] is the walk above. [`LinkGraph::with_walk`]
//! replaces it: other roots, pruned folders, dot files, refused symlinks,
//! propagated errors or excluded files of the caller's own
//! ([`Hide::Rules`]). [`LinkGraph::apply_changes`] asks the walk about each
//! path ([`WalkOptions::admission`]): it ignores one outside the walk, drops
//! one the walk would no longer list, and reads the rest.
//! [`LinkGraph::with_split`]
//! picks how each note's frontmatter is found, and
//! [`LinkGraph::with_list_only`] which notes are listed but never read.
//!
//! [`LinkGraph::refresh`] never fails: a walk error (only possible when the
//! walk refuses symlinks or propagates errors) leaves the graph as it was,
//! or empty when the call moved it to another corpus.
//! [`LinkGraph::try_refresh`] returns it.
//!
//! # What it could not read
//!
//! The walk's [`WalkOptions::errors`] also decides what the graph does with
//! a note it lists but cannot read. [`Errors::Skip`], the default: the note
//! has empty facts. [`Errors::Report`]: the same, and the error is kept with
//! the walk's own in [`LinkGraph::unreadable`], so a caller can say what it
//! passed over. [`Errors::Propagate`]: the sweep fails. A note that could
//! not be read is never fresh, so every sweep tries it again.
//!
//! # Freshness
//!
//! A note is re-read when its `(size, mtime)` differs from the cached one. A
//! note with no modification time is never fresh. A same-size edit within
//! one timestamp tick is missed; [`LinkGraph::mark_stale`] or
//! [`LinkGraph::apply_changes`] is the answer when the caller knows.
//!
//! A completed sweep is reused for 500 ms (60 s once
//! [`LinkGraph::set_watched`] says change events arrive), so a burst of reads
//! shares one walk. A different corpus always walks. The time comes from the
//! [`Clock`] passed in, so this runs on hosts with no system clock.
//!
//! # Locking
//!
//! One mutex over the whole state. The walk and the per-note reads run with
//! no lock held, against a snapshot; the swap at the end takes the lock
//! briefly. A sweep that started before a corpus switch, or before an
//! [`LinkGraph::apply_changes`] landed, does not install its older result.
//!
//! # Resolution is not cached per note
//!
//! [`NoteFacts::links`] holds targets as written. What a target resolves to
//! depends on the whole corpus (creating `Alpha.md` changes every `[[Alpha]]`),
//! so it is recomputed from the suffix index each sweep.

use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use markdown_link::{BodyLink, BodyLinkKind, LinkIndex, RawLink, ResolveError};
use markdown_vault_fs::walk::{Admission, Errors, Hide, WalkError, WalkOptions};
use vfs_seam::{Clock, Metadata, Vfs, VfsError};

use crate::note::{SplitMode, read_note_with, split_with};
use crate::tags::{NoTags, TagLexer};

/// How long a completed sweep counts as current, in milliseconds.
pub const REFRESH_TTL_MS: i64 = 500;

/// [`REFRESH_TTL_MS`] while the corpus is under a filesystem watch.
pub const WATCHED_TTL_MS: i64 = 60_000;

/// How many source notes one [`LinkGraph::backlinks`] answer carries. The
/// rest are counted in [`BacklinkPage::total`], never dropped silently.
pub const MAX_BACKLINK_SOURCES: usize = 200;

/// What kind of reference an edge is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum EdgeKind {
    /// A `[[link]]` or a relative markdown link in the body.
    Link,
    /// A `![[embed]]` in the body.
    Embed,
    /// A link or file path in a frontmatter value.
    Frontmatter,
}

impl EdgeKind {
    /// The kind of a body link.
    pub fn of(kind: BodyLinkKind) -> EdgeKind {
        match kind {
            BodyLinkKind::Embed => EdgeKind::Embed,
            _ => EdgeKind::Link,
        }
    }

    /// The body kinds, which [`LinkGraph::backlinks`] counts.
    pub const BODY: [EdgeKind; 2] = [EdgeKind::Link, EdgeKind::Embed];

    /// Every kind.
    pub const ALL: [EdgeKind; 3] = [EdgeKind::Link, EdgeKind::Embed, EdgeKind::Frontmatter];
}

/// One reference from a note, resolved or not.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Edge {
    /// The note the reference is in.
    pub source: String,
    /// The target as written.
    pub target: String,
    /// The file it resolves to from `source`, or `None` when nothing does.
    pub resolved: Option<String>,
    /// What kind of reference it is.
    pub kind: EdgeKind,
    /// The 1-indexed body line, for a body link.
    pub line: Option<u64>,
    /// The top-level frontmatter key, for a frontmatter link.
    pub field: Option<String>,
}

/// Everything derived from one note, cached against its stamp.
#[derive(Debug, Clone, Default)]
pub struct NoteFacts {
    /// Outgoing body links, as written, with body-relative spans.
    pub links: Vec<BodyLink>,
    /// The 1-indexed body line of each link in [`Self::links`], same order.
    pub lines: Vec<u64>,
    /// Wikilinks and file paths in frontmatter values, with their top-level
    /// key.
    pub frontmatter_links: Vec<RawLink>,
    /// Inline tags, one deduped list per [`TagLexer`] dialect slot.
    pub tags: Vec<Vec<String>>,
    size: u64,
    /// `None` when the note could not be stamped; never compares fresh.
    mtime_ns: Option<i64>,
}

impl NoteFacts {
    /// The tags in dialect slot `slot`, empty when the lexer has none there.
    pub fn tags_in(&self, slot: usize) -> &[String] {
        self.tags.get(slot).map_or(&[], Vec::as_slice)
    }
}

type NoteMap = BTreeMap<String, Arc<NoteFacts>>;

/// Target path -> the notes whose body links to it, ascending by source.
type BacklinkMap = BTreeMap<String, Vec<BacklinkSource>>;

#[derive(Debug, Clone)]
struct BacklinkSource {
    source: Arc<str>,
    /// `(line, kind)` per link to this target, ascending by line.
    lines: Vec<(u64, EdgeKind)>,
}

/// Target path -> the frontmatter references to it.
type FrontmatterMap = BTreeMap<String, Vec<(Arc<str>, RawLink)>>;

#[derive(Debug, Default)]
struct GraphState {
    notes: Arc<NoteMap>,
    backlinks: Arc<BacklinkMap>,
    frontmatter: Arc<FrontmatterMap>,
    unresolved: Arc<Vec<Edge>>,
    index: LinkIndex,
    /// Every file the walk saw, sorted by `slug_collate::compare_paths`.
    paths: Arc<Vec<String>>,
    for_vault: Option<PathBuf>,
    /// When the sweep behind `notes` finished, by the caller's clock. `None`
    /// is never fresh.
    swept_at: Option<i64>,
    /// Bumped on each corpus switch; a sweep from before one is discarded.
    generation: u64,
    /// Bumped by each [`LinkGraph::apply_changes`]; a sweep from before one
    /// is discarded.
    applied: u64,
    /// Bumped by [`LinkGraph::mark_stale`] and a skipped apply; a sweep from
    /// before one installs but is not stamped fresh.
    stale_marks: u64,
    /// What the sweep behind `notes` and the applies since could not read.
    unreadable: Arc<Vec<Arc<VfsError>>>,
}

/// Which notes a graph lists but never reads. See
/// [`LinkGraph::with_list_only`].
type ListOnly = Arc<dyn Fn(&str) -> bool + Send + Sync>;

/// A cached, incrementally refreshed link graph over every file in a corpus.
/// `Send + Sync`: the file system and clock are passed to each call, never
/// kept.
pub struct LinkGraph {
    state: Mutex<GraphState>,
    rebuilds: AtomicU64,
    watched: AtomicBool,
    /// Held by [`Self::apply_changes`] across its read and its install, so
    /// batches install in the order they read the files. Taken before `state`.
    apply_lock: Mutex<()>,
    tags: Arc<dyn TagLexer + Send + Sync>,
    walk: WalkOptions,
    split: SplitMode,
    list_only: Option<ListOnly>,
}

impl std::fmt::Debug for LinkGraph {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LinkGraph")
            .field("state", &self.state)
            .field("walk", &self.walk)
            .field("split", &self.split)
            .field("list_only", &self.list_only.is_some())
            .finish_non_exhaustive()
    }
}

impl Default for LinkGraph {
    fn default() -> Self {
        LinkGraph::with_tags(Arc::new(NoTags))
    }
}

/// What a refresh changed.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct GraphStats {
    /// Notes seen for the first time.
    pub added: usize,
    /// Notes re-read because their stamp moved.
    pub updated: usize,
    /// Notes that are gone.
    pub removed: usize,
    /// Notes whose stamp matched, so their facts were reused.
    pub unchanged: usize,
    /// Files a link can resolve to: notes plus attachments.
    pub resolvable: usize,
}

/// One note that links to another, and where.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Backlink {
    /// The linking note.
    pub source_path: String,
    /// How many links in it point here.
    pub count: u64,
    /// One per link, ascending by line.
    pub contexts: Vec<LinkContext>,
}

/// Where one backlink sits in its source note.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LinkContext {
    /// The 1-indexed body line.
    pub line: u64,
    /// The line's text, trimmed. Empty until [`LinkGraph::fill_contexts`] reads it.
    pub text: String,
    /// A link or an embed.
    pub kind: EdgeKind,
}

/// A capped answer to "what links here", with the uncapped count beside it.
#[derive(Debug, Clone, Default)]
pub struct BacklinkPage {
    /// At most [`MAX_BACKLINK_SOURCES`] source notes, ascending by path.
    pub backlinks: Vec<Backlink>,
    /// How many source notes link here in total.
    pub total: usize,
}

impl BacklinkPage {
    /// Whether the cap dropped anything.
    pub fn truncated(&self) -> bool {
        self.total > self.backlinks.len()
    }
}

impl LinkGraph {
    /// An empty graph that finds no inline tags.
    pub fn new() -> Self {
        LinkGraph::default()
    }

    /// An empty graph that lexes inline tags with `tags`.
    pub fn with_tags(tags: Arc<dyn TagLexer + Send + Sync>) -> Self {
        LinkGraph {
            state: Mutex::default(),
            rebuilds: AtomicU64::new(0),
            watched: AtomicBool::new(false),
            apply_lock: Mutex::new(()),
            tags,
            walk: LinkGraph::default_walk(),
            split: SplitMode::default(),
            list_only: None,
        }
    }

    /// The walk a graph uses unless told otherwise: notes and attachments,
    /// `_system/` included, and no excluded files ([`Hide::Off`]), so a link
    /// into an excluded file still resolves.
    pub fn default_walk() -> WalkOptions {
        WalkOptions {
            hide: Hide::Off,
            ..WalkOptions::notes_and_attachments()
        }
    }

    /// This graph, walking with `walk` instead of [`Self::default_walk`].
    /// Set it before the first refresh: a graph already built keeps its
    /// notes until the next sweep.
    pub fn with_walk(mut self, walk: WalkOptions) -> Self {
        self.walk = walk;
        self
    }

    /// This graph, finding each note's frontmatter by `split`. Body links,
    /// their lines and the frontmatter links all follow it.
    pub fn with_split(mut self, split: SplitMode) -> Self {
        self.split = split;
        self
    }

    /// This graph, listing the notes at the corpus-relative paths
    /// `list_only` picks without reading them. They are files a link
    /// resolves to, as an attachment is, with no facts, no outgoing edges
    /// and no backlinks from them, and [`Self::len`] does not count them.
    /// For a caller that needs the paths under some folders (dot-named
    /// tooling folders, say) but not their links. Set it before the first
    /// refresh.
    pub fn with_list_only(
        mut self,
        list_only: impl Fn(&str) -> bool + Send + Sync + 'static,
    ) -> Self {
        self.list_only = Some(Arc::new(list_only));
        self
    }

    /// Whether this graph reads the note at `rel`: not one
    /// [`Self::with_list_only`] picks.
    fn reads(&self, rel: &str) -> bool {
        self.list_only
            .as_ref()
            .is_none_or(|list_only| !list_only(rel))
    }

    /// The walk this graph sweeps with.
    pub fn walk_options(&self) -> &WalkOptions {
        &self.walk
    }

    /// How this graph finds each note's frontmatter.
    pub fn split_mode(&self) -> SplitMode {
        self.split
    }

    /// Fills each backlink context's `text` from its source note's body,
    /// read from the corpus at `vault_dir` (the one the backlinks came
    /// from) and split as this graph splits ([`Self::split_mode`]), so the
    /// lines match. One read per source, so call it on a capped page.
    ///
    /// The corpus is passed in, not taken from the graph: a graph that
    /// another thread moves to another corpus must not fill a page with the
    /// other corpus's lines.
    pub fn fill_contexts(&self, vfs: &dyn Vfs, vault_dir: &Path, backlinks: &mut [Backlink]) {
        for entry in backlinks.iter_mut() {
            let Some(body) = NoteBody::read_with(vfs, vault_dir, &entry.source_path, self.split)
            else {
                continue;
            };
            for ctx in entry.contexts.iter_mut() {
                if let Some(line) = body.line(ctx.line) {
                    ctx.text = line.to_string();
                }
            }
        }
    }

    /// Walks the corpus and brings the graph up to date, reusing a sweep
    /// younger than the TTL over the same corpus. A reused sweep reports the
    /// cache as `unchanged`. A walk error leaves the graph as it was (empty
    /// when `vault_dir` is another corpus) and reports nothing changed;
    /// [`Self::try_refresh`] returns it.
    pub fn refresh(&self, vfs: &dyn Vfs, clock: &dyn Clock, vault_dir: &Path) -> GraphStats {
        self.try_refresh(vfs, clock, vault_dir).unwrap_or_default()
    }

    /// [`Self::refresh`] that always walks. For a caller that has just
    /// changed the corpus and must see its own edit.
    pub fn refresh_now(&self, vfs: &dyn Vfs, clock: &dyn Clock, vault_dir: &Path) -> GraphStats {
        self.try_refresh_now(vfs, clock, vault_dir)
            .unwrap_or_default()
    }

    /// [`Self::refresh`] that returns a walk error instead of leaving the
    /// graph as it was. Only a walk that refuses symlinks or propagates
    /// errors can fail.
    pub fn try_refresh(
        &self,
        vfs: &dyn Vfs,
        clock: &dyn Clock,
        vault_dir: &Path,
    ) -> Result<GraphStats, WalkError> {
        self.sweep(vfs, clock.now_ms(), vault_dir, true)
    }

    /// [`Self::refresh_now`] that returns a walk error.
    pub fn try_refresh_now(
        &self,
        vfs: &dyn Vfs,
        clock: &dyn Clock,
        vault_dir: &Path,
    ) -> Result<GraphStats, WalkError> {
        self.sweep(vfs, clock.now_ms(), vault_dir, false)
    }

    fn sweep(
        &self,
        vfs: &dyn Vfs,
        now: i64,
        vault_dir: &Path,
        honor_ttl: bool,
    ) -> Result<GraphStats, WalkError> {
        // 1. Under the lock: decide whether to walk, claim a new corpus, and
        // take the map to compare against.
        let (generation, applied, stale_marks, cache, prev_paths) = {
            let mut state = self.state.lock().unwrap();
            if state.for_vault.as_deref() == Some(vault_dir) {
                if honor_ttl
                    && let Some(done) = state.swept_at
                    && (0..self.ttl()).contains(&(now - done))
                {
                    return Ok(GraphStats {
                        unchanged: state.notes.len(),
                        resolvable: state.index.len(),
                        ..GraphStats::default()
                    });
                }
            } else {
                // Claimed before the walk, so a reader mid-sweep sees an
                // empty graph, never the previous corpus's edges.
                let emptied = !state.paths.is_empty();
                *state = GraphState {
                    for_vault: Some(vault_dir.to_path_buf()),
                    generation: state.generation + 1,
                    applied: state.applied,
                    stale_marks: state.stale_marks,
                    ..GraphState::default()
                };
                // Emptying the graph moved its content, even if the walk
                // below then fails or finds nothing.
                if emptied {
                    self.rebuilds.fetch_add(1, Ordering::SeqCst);
                }
            }
            (
                state.generation,
                state.applied,
                state.stale_marks,
                Arc::clone(&state.notes),
                Arc::clone(&state.paths),
            )
        };

        // 2. Walk and read with no lock held. By default excluded files stay:
        // links to them still resolve, as in Obsidian.
        let walked = markdown_vault_fs::walk::walk_reporting(vfs, vault_dir, &self.walk)?;
        let entries = walked.entries;
        let mut unreadable: Vec<Arc<VfsError>> = walked.errors.into_iter().map(Arc::new).collect();
        // Sorted by the comparator `apply_changes` binary-searches with.
        let mut paths: Vec<String> = entries.iter().map(|e| e.rel.clone()).collect();
        paths.sort_by(|a, b| slug_collate::compare_paths(a, b));
        let mut stats = GraphStats::default();
        let mut seen: NoteMap = BTreeMap::new();

        for entry in entries
            .into_iter()
            .filter(|e| e.is_note && self.reads(&e.rel))
        {
            // A symlink's walk stamp describes the link; stamp its target.
            let stamp = if entry.is_symlink {
                stamp_of(vfs, &entry.abs)
            } else {
                entry.mtime_ns.map(|m| (entry.size, m))
            };
            let reusable = stamp
                .and_then(|(size, mtime)| {
                    cache
                        .get(&entry.rel)
                        .filter(|c| c.size == size && c.mtime_ns == Some(mtime))
                })
                .map(Arc::clone);
            if let Some(facts) = reusable {
                stats.unchanged += 1;
                seen.insert(entry.rel, facts);
                continue;
            }
            let (size, mtime) = match stamp {
                Some((size, mtime)) => (size, Some(mtime)),
                None => (0, None),
            };
            let existed = cache.contains_key(&entry.rel);
            let (facts, unread) = scan_note(vfs, &*self.tags, self.split, &entry.abs, size, mtime);
            if let Some(e) = unread {
                keep_read_error(self.walk.errors, e, &mut unreadable)?;
            }
            seen.insert(entry.rel, Arc::new(facts));
            if existed {
                stats.updated += 1;
            } else {
                stats.added += 1;
            }
        }
        stats.removed = cache.keys().filter(|k| !seen.contains_key(*k)).count();

        #[cfg(test)]
        hooks::run_mid_sweep();

        // A clean sweep has nothing to rebuild; it only restamps, and keeps
        // what it could not read.
        let clean = stats.added == 0 && stats.updated == 0 && stats.removed == 0;
        if clean && *prev_paths == paths {
            let mut state = self.state.lock().unwrap();
            if state.generation == generation && state.applied == applied {
                state.unreadable = Arc::new(unreadable);
            }
            if state.generation == generation && state.stale_marks == stale_marks {
                state.swept_at = Some(now);
            }
            stats.resolvable = state.index.len();
            return Ok(stats);
        }

        let index = LinkIndex::build(&paths);
        stats.resolvable = index.len();
        let inverted = invert(&seen, &index);

        // 3. Swap under the lock.
        let mut state = self.state.lock().unwrap();
        if state.generation == generation && state.applied == applied {
            state.notes = Arc::new(seen);
            state.backlinks = Arc::new(inverted.backlinks);
            state.frontmatter = Arc::new(inverted.frontmatter);
            state.unresolved = Arc::new(inverted.unresolved);
            state.index = index;
            state.paths = Arc::new(paths);
            state.unreadable = Arc::new(unreadable);
            // A stale mark that landed mid-sweep must survive the swap.
            if state.stale_marks == stale_marks {
                state.swept_at = Some(now);
            }
            // Bumped inside the swap's lock hold, after the moves, so a reader
            // that sees the new count reads the new map.
            self.rebuilds.fetch_add(1, Ordering::SeqCst);
        }
        Ok(stats)
    }

    /// How many sweeps rebuilt the index and the edges. A clean sweep does
    /// not count. A switch to another corpus empties the graph first, and
    /// that counts too, whatever the walk then finds.
    pub fn rebuilds(&self) -> u64 {
        self.rebuilds.load(Ordering::SeqCst)
    }

    /// How many [`Self::apply_changes`] batches the graph has taken. With
    /// [`Self::rebuilds`], says whether the content moved.
    pub fn applied(&self) -> u64 {
        self.state.lock().unwrap().applied
    }

    /// Brings the graph up to date for named changed paths, without a walk.
    ///
    /// The file system decides each path: present (spelled as listed in its
    /// folder) or gone. A changed note is re-read; the suffix index is
    /// rebuilt only when the path set moved. A path outside the graph's walk
    /// ([`WalkOptions::admission`]) is ignored, and one the walk would no
    /// longer list (too small, a refused symlink, under a symlinked folder
    /// or a folder that cannot be listed) is dropped as if gone. A batch
    /// against another
    /// corpus, or while no sweep is fresh, does nothing here, but marks the
    /// graph so a sweep that read the files before the change is not stamped
    /// fresh.
    ///
    /// A change to a file the walk reads its rules from
    /// ([`WalkOptions::reads_rules_from`], the excluded files under
    /// [`Hide::Vault`]) can move any path, so it marks the graph stale and
    /// the next refresh walks.
    pub fn apply_changes(&self, vfs: &dyn Vfs, vault_dir: &Path, rels: &[String]) {
        self.apply_paths(vfs, vault_dir, rels);
        if rels.iter().any(|rel| self.walk.reads_rules_from(rel))
            && self.state.lock().unwrap().for_vault.as_deref() == Some(vault_dir)
        {
            self.mark_stale();
        }
    }

    /// [`Self::apply_changes`] path by path.
    fn apply_paths(&self, vfs: &dyn Vfs, vault_dir: &Path, rels: &[String]) {
        // The admissions read the file system, so they are taken under the
        // apply lock: a batch that read a file before another batch must not
        // install after it.
        let _apply = self.apply_lock.lock().unwrap();
        let admitted: Vec<(&String, Admission)> = self
            .walk
            .admissions(vfs, vault_dir, rels)
            .into_iter()
            .filter(|(_, admission)| *admission != Admission::Outside)
            .collect();
        if admitted.is_empty() {
            return;
        }
        {
            let mut state = self.state.lock().unwrap();
            if state.for_vault.as_deref() != Some(vault_dir) {
                return;
            }
            if state.swept_at.is_none() {
                state.stale_marks += 1;
                return;
            }
        }

        enum Seen {
            Note(NoteFacts),
            File,
            Gone,
        }
        let mut unread = Vec::new();
        let scanned: Vec<(&String, PathBuf, Seen)> = admitted
            .into_iter()
            .map(|(rel, admission)| {
                let abs = join_rel(vault_dir, rel);
                // The admission says whether the walk lists the path. As in
                // the sweep, a note it lists is read through a link, and one
                // that cannot be stamped (a dangling link, a link to a
                // folder) is kept with nothing read and never fresh.
                let seen = if admission == Admission::Unlisted {
                    Seen::Gone
                } else if rel.to_lowercase().ends_with(".md") && self.reads(rel) {
                    let (size, mtime) = stamp_listed(vfs, &abs);
                    let (facts, e) = scan_note(vfs, &*self.tags, self.split, &abs, size, mtime);
                    if let Some(e) = e
                        && self.walk.errors == Errors::Report
                    {
                        unread.push(Arc::new(e));
                    }
                    Seen::Note(facts)
                } else {
                    Seen::File
                };
                (rel, abs, seen)
            })
            .collect();

        #[cfg(test)]
        hooks::run_mid_apply();

        let mut state = self.state.lock().unwrap();
        if state.for_vault.as_deref() != Some(vault_dir) {
            return;
        }
        state.applied += 1;
        // What the apply read replaces what was known about those paths.
        let unreadable = Arc::make_mut(&mut state.unreadable);
        unreadable.retain(|e| !scanned.iter().any(|(_, abs, _)| e.path() == abs));
        unreadable.extend(unread);
        let mut paths_changed = false;
        let mut notes_changed = false;
        for (rel, _, seen) in scanned {
            let present = matches!(seen, Seen::Note(_) | Seen::File);
            let paths = Arc::make_mut(&mut state.paths);
            match paths.binary_search_by(|p| slug_collate::compare_paths(p, rel)) {
                Ok(i) if !present => {
                    paths.remove(i);
                    paths_changed = true;
                }
                Err(i) if present => {
                    paths.insert(i, rel.clone());
                    paths_changed = true;
                }
                _ => {}
            }
            let notes = Arc::make_mut(&mut state.notes);
            match seen {
                Seen::Note(facts) => {
                    notes.insert(rel.clone(), Arc::new(facts));
                    notes_changed = true;
                }
                Seen::File => {}
                Seen::Gone => notes_changed |= notes.remove(rel.as_str()).is_some(),
            }
        }
        if paths_changed {
            state.index = LinkIndex::build(&state.paths);
        }
        if paths_changed || notes_changed {
            let inverted = invert(&state.notes, &state.index);
            state.backlinks = Arc::new(inverted.backlinks);
            state.frontmatter = Arc::new(inverted.frontmatter);
            state.unresolved = Arc::new(inverted.unresolved);
        }
    }

    /// What the graph could not read, under [`Errors::Report`]: each folder
    /// the last sweep could not list and each file it could not stat (in
    /// walk order), then each note it listed but could not read. An apply
    /// replaces the entries for the paths it names with what it met, so a
    /// note it now reads leaves the list and one it cannot read joins it.
    /// Empty under the other [`Errors`] policies.
    ///
    /// Each path is the corpus folder joined with the corpus-relative path.
    pub fn unreadable(&self) -> Vec<Arc<VfsError>> {
        (*self.state.lock().unwrap().unreadable).clone()
    }

    /// Says the corpus is under a filesystem watch, so a sweep stays fresh for
    /// [`WATCHED_TTL_MS`]. One-way.
    pub fn set_watched(&self) {
        self.watched.store(true, Ordering::SeqCst);
    }

    /// Drops the freshness stamp so the next refresh walks, keeping the facts
    /// for reuse. For a change that cannot be named per path, such as a
    /// folder rename.
    pub fn mark_stale(&self) {
        let mut state = self.state.lock().unwrap();
        state.swept_at = None;
        state.stale_marks += 1;
    }

    fn ttl(&self) -> i64 {
        if self.watched.load(Ordering::SeqCst) {
            WATCHED_TTL_MS
        } else {
            REFRESH_TTL_MS
        }
    }

    /// Borrows the suffix index for the length of `f`.
    pub fn with_index<T>(&self, f: impl FnOnce(&LinkIndex) -> T) -> T {
        f(&self.state.lock().unwrap().index)
    }

    /// Borrows every note's cached facts for the length of `f`.
    ///
    /// The spans were taken at sweep time. A caller about to splice bytes
    /// re-reads the note: the cache says which files to look at, the file
    /// says where the bytes are.
    pub fn with_notes<T>(&self, f: impl FnOnce(&BTreeMap<String, Arc<NoteFacts>>) -> T) -> T {
        f(&self.state.lock().unwrap().notes)
    }

    /// Borrows every path and every note's facts from one lock hold, so the
    /// two come from the same sweep or apply. [`Self::paths`] then
    /// [`Self::with_notes`] could straddle a refresh.
    pub fn with_snapshot<T>(
        &self,
        f: impl FnOnce(&[String], &BTreeMap<String, Arc<NoteFacts>>) -> T,
    ) -> T {
        let state = self.state.lock().unwrap();
        f(&state.paths, &state.notes)
    }

    /// Every path, body link and frontmatter link, read under one lock hold
    /// ([`Self::with_snapshot`]), so all three come from the same sweep.
    pub fn snapshot(&self) -> LinkSnapshot {
        self.with_snapshot(|paths, notes| LinkSnapshot {
            paths: paths.to_vec(),
            body_links: body_links_of(notes),
            frontmatter_links: frontmatter_links_of(notes),
        })
    }

    /// Each note's outgoing body links, as written, with body-relative spans.
    pub fn body_links(&self) -> BTreeMap<String, Vec<BodyLink>> {
        self.with_notes(body_links_of)
    }

    /// Each note's frontmatter references (wikilinks and file paths, with the
    /// top-level key). Notes with none are left out.
    pub fn frontmatter_links(&self) -> BTreeMap<String, Vec<RawLink>> {
        self.with_notes(frontmatter_links_of)
    }

    /// Every file the last sweep saw, notes and attachments, in
    /// `slug_collate::compare_paths` order.
    pub fn paths(&self) -> Vec<String> {
        (*self.state.lock().unwrap().paths).clone()
    }

    /// Every path the last sweep saw with extension `ext` (no dot, any case).
    pub fn paths_with_ext(&self, ext: &str) -> Vec<String> {
        let suffix = format!(".{}", ext.to_lowercase());
        self.state
            .lock()
            .unwrap()
            .paths
            .iter()
            .filter(|p| p.to_lowercase().ends_with(&suffix))
            .cloned()
            .collect()
    }

    /// What `target` resolves to as written in `from`.
    pub fn resolve(&self, target: &str, from: &str) -> Option<String> {
        self.with_index(|i| i.resolve_from(target, from).map(str::to_string))
    }

    /// [`Self::resolve`] that refuses an ambiguous target instead of picking
    /// the nearest candidate. See [`LinkIndex::resolve_strict`].
    pub fn resolve_strict(&self, target: &str, from: &str) -> Result<String, ResolveError> {
        self.with_index(|i| i.resolve_strict(target, from).map(str::to_string))
    }

    /// Every note whose body links to `path` (links and embeds; a note's
    /// links to itself are left out), ascending by source, capped at
    /// [`MAX_BACKLINK_SOURCES`].
    ///
    /// `path` is resolved first, so `Alpha` answers like `Projects/Alpha.md`.
    /// An input nothing resolves to has no backlinks.
    pub fn backlinks(&self, path: &str) -> BacklinkPage {
        let state = self.state.lock().unwrap();
        let target = state.index.resolve(path).unwrap_or(path);
        let Some(sources) = state.backlinks.get(target) else {
            return BacklinkPage::default();
        };
        BacklinkPage {
            total: sources.len(),
            backlinks: sources
                .iter()
                .take(MAX_BACKLINK_SOURCES)
                .map(|s| Backlink {
                    source_path: s.source.to_string(),
                    count: s.lines.len() as u64,
                    contexts: s
                        .lines
                        .iter()
                        .map(|&(line, kind)| LinkContext {
                            line,
                            text: String::new(),
                            kind,
                        })
                        .collect(),
                })
                .collect(),
        }
    }

    /// The paths of the notes [`Self::backlinks`] lists, capped the same.
    pub fn backlink_sources(&self, path: &str) -> Vec<String> {
        let state = self.state.lock().unwrap();
        let target = state.index.resolve(path).unwrap_or(path);
        state
            .backlinks
            .get(target)
            .map(|sources| {
                sources
                    .iter()
                    .take(MAX_BACKLINK_SOURCES)
                    .map(|s| s.source.to_string())
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Body-link sources for each of `paths`, matched exactly rather than
    /// resolved (a path is a file, not a link target). Uncapped, each source
    /// with its body lines ascending.
    pub fn inbound_exact(&self, paths: &[String]) -> Vec<Vec<(String, Vec<u64>)>> {
        let state = self.state.lock().unwrap();
        paths
            .iter()
            .map(|path| {
                state
                    .backlinks
                    .get(path.as_str())
                    .map(|sources| {
                        sources
                            .iter()
                            .map(|s| {
                                (
                                    s.source.to_string(),
                                    s.lines.iter().map(|(l, _)| *l).collect(),
                                )
                            })
                            .collect()
                    })
                    .unwrap_or_default()
            })
            .collect()
    }

    /// Every edge of the given kinds that resolves to `path` (resolved first,
    /// as in [`Self::backlinks`]), uncapped, ascending by source then line.
    /// Unlike `backlinks`, frontmatter references can be asked for.
    pub fn inbound(&self, path: &str, kinds: &[EdgeKind]) -> Vec<Edge> {
        let state = self.state.lock().unwrap();
        let target = state.index.resolve(path).unwrap_or(path).to_string();
        let mut out = Vec::new();
        if let Some(sources) = state.backlinks.get(&target) {
            for s in sources {
                // The written target is not kept in the inverted map; read it
                // back from the source's facts, in the same order.
                let facts = state.notes.get(&*s.source);
                for &(line, kind) in &s.lines {
                    if !kinds.contains(&kind) {
                        continue;
                    }
                    let written = facts
                        .and_then(|f| {
                            f.links
                                .iter()
                                .zip(&f.lines)
                                .find(|(l, n)| **n == line && EdgeKind::of(l.kind) == kind)
                        })
                        .map(|(l, _)| l.target.clone())
                        .unwrap_or_default();
                    out.push(Edge {
                        source: s.source.to_string(),
                        target: written,
                        resolved: Some(target.clone()),
                        kind,
                        line: Some(line),
                        field: None,
                    });
                }
            }
        }
        if kinds.contains(&EdgeKind::Frontmatter)
            && let Some(refs) = state.frontmatter.get(&target)
        {
            for (source, raw) in refs {
                out.push(Edge {
                    source: source.to_string(),
                    target: raw.target.clone(),
                    resolved: Some(target.clone()),
                    kind: EdgeKind::Frontmatter,
                    line: None,
                    field: raw.field.clone(),
                });
            }
        }
        out.sort_by(|a, b| a.source.cmp(&b.source).then(a.line.cmp(&b.line)));
        out
    }

    /// Every edge, of any kind, that resolves to nothing, ascending by source.
    pub fn unresolved(&self) -> Vec<Edge> {
        (*self.state.lock().unwrap().unresolved).clone()
    }

    /// Every edge out of `source`, resolved from it, in the note's order:
    /// body links first, then frontmatter references.
    pub fn outbound(&self, source: &str) -> Vec<Edge> {
        let state = self.state.lock().unwrap();
        let Some(facts) = state.notes.get(source) else {
            return Vec::new();
        };
        edges_of(source, facts, &state.index)
    }

    /// Inline tags per note in dialect slot `slot`.
    pub fn inline_tags_by_note(&self, slot: usize) -> BTreeMap<String, Vec<String>> {
        self.state
            .lock()
            .unwrap()
            .notes
            .iter()
            .map(|(path, facts)| (path.clone(), facts.tags_in(slot).to_vec()))
            .collect()
    }

    /// How many notes are cached. Zero before the first refresh.
    pub fn len(&self) -> usize {
        self.state.lock().unwrap().notes.len()
    }

    /// Whether no note is cached.
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

/// Every edge out of one note, resolved from it.
fn edges_of(source: &str, facts: &NoteFacts, index: &LinkIndex) -> Vec<Edge> {
    let body = facts
        .links
        .iter()
        .zip(&facts.lines)
        .filter(|(l, _)| !l.target.is_empty())
        .map(|(l, line)| Edge {
            source: source.to_string(),
            target: l.target.clone(),
            resolved: index.resolve_from(&l.target, source).map(str::to_string),
            kind: EdgeKind::of(l.kind),
            line: Some(*line),
            field: None,
        });
    let frontmatter = facts.frontmatter_links.iter().map(|l| Edge {
        source: source.to_string(),
        target: l.target.clone(),
        resolved: index.resolve_from(&l.target, source).map(str::to_string),
        kind: EdgeKind::Frontmatter,
        line: None,
        field: l.field.clone(),
    });
    body.chain(frontmatter).collect()
}

struct Inverted {
    backlinks: BacklinkMap,
    frontmatter: FrontmatterMap,
    unresolved: Vec<Edge>,
}

/// Inverts a sweep's out-edges, resolving each target once, as written in
/// its source note. Links to the note itself are dropped from the backlinks.
fn invert(notes: &NoteMap, index: &LinkIndex) -> Inverted {
    let interned: BTreeMap<&str, Arc<str>> = notes
        .keys()
        .map(|path| (path.as_str(), Arc::from(path.as_str())))
        .collect();
    let mut backlinks: BacklinkMap = BTreeMap::new();
    let mut frontmatter: FrontmatterMap = BTreeMap::new();
    let mut unresolved = Vec::new();
    for (source, facts) in notes.iter() {
        let mut per_target: BTreeMap<&str, Vec<(u64, EdgeKind)>> = BTreeMap::new();
        for (link, line) in facts.links.iter().zip(facts.lines.iter()) {
            if link.target.is_empty() {
                continue;
            }
            let Some(target) = index.resolve_from(&link.target, source) else {
                unresolved.push(Edge {
                    source: source.clone(),
                    target: link.target.clone(),
                    resolved: None,
                    kind: EdgeKind::of(link.kind),
                    line: Some(*line),
                    field: None,
                });
                continue;
            };
            if target == source.as_str() {
                continue;
            }
            per_target
                .entry(target)
                .or_default()
                .push((*line, EdgeKind::of(link.kind)));
        }
        for (target, mut lines) in per_target {
            lines.sort_unstable();
            backlinks
                .entry(target.to_string())
                .or_default()
                .push(BacklinkSource {
                    source: Arc::clone(&interned[source.as_str()]),
                    lines,
                });
        }
        for raw in &facts.frontmatter_links {
            match index.resolve_from(&raw.target, source) {
                Some(target) => frontmatter
                    .entry(target.to_string())
                    .or_default()
                    .push((Arc::clone(&interned[source.as_str()]), raw.clone())),
                None => unresolved.push(Edge {
                    source: source.clone(),
                    target: raw.target.clone(),
                    resolved: None,
                    kind: EdgeKind::Frontmatter,
                    line: None,
                    field: raw.field.clone(),
                }),
            }
        }
    }
    Inverted {
        backlinks,
        frontmatter,
        unresolved,
    }
}

/// `(size, mtime)` of the file at `abs`, through a symlink, or `None` when it
/// cannot be stamped. A missing mtime is no stamp: it would otherwise compare
/// equal to itself and never be re-read.
pub(crate) fn stamp_of(vfs: &dyn Vfs, abs: &Path) -> Option<(u64, i64)> {
    stamp_through(vfs, abs, vfs.metadata(abs).ok()?)
}

/// `(size, mtime)` for a file the walk lists: [`stamp_of`], or when that
/// fails (a dangling link, a link to a folder, no time) the size of the
/// entry itself and no time, which never compares fresh.
pub(crate) fn stamp_listed(vfs: &dyn Vfs, abs: &Path) -> (u64, Option<i64>) {
    let Ok(entry) = vfs.metadata(abs) else {
        return (0, None);
    };
    match stamp_through(vfs, abs, entry) {
        Some((size, mtime)) => (size, Some(mtime)),
        None => (entry.len, None),
    }
}

/// [`stamp_of`] given the entry's own metadata.
fn stamp_through(vfs: &dyn Vfs, abs: &Path, entry: Metadata) -> Option<(u64, i64)> {
    let mut meta = entry;
    if meta.is_symlink {
        let target = vfs.canonicalize(abs).ok()?;
        meta = vfs.metadata(&target).ok()?;
    }
    if meta.is_dir {
        return None;
    }
    Some((meta.len, meta.modified_ns?))
}

/// `vault_dir` joined with each segment of a `/`-separated path.
pub(crate) fn join_rel(vault_dir: &Path, rel: &str) -> PathBuf {
    let mut path = vault_dir.to_path_buf();
    for seg in rel.split('/').filter(|s| !s.is_empty()) {
        path.push(seg);
    }
    path
}

/// What the walk's error policy makes of a note the cache listed but could
/// not read: nothing, an entry in the cache's report, or a failed sweep.
pub(crate) fn keep_read_error(
    errors: Errors,
    e: VfsError,
    unreadable: &mut Vec<Arc<VfsError>>,
) -> Result<(), WalkError> {
    match errors {
        Errors::Skip => Ok(()),
        Errors::Report => {
            unreadable.push(Arc::new(e));
            Ok(())
        }
        Errors::Propagate => Err(WalkError::Io(e)),
    }
}

/// Reads one note and derives its facts. An unreadable note has empty facts
/// and no time, so it is never fresh and the next sweep tries it again, and
/// the read error beside them.
fn scan_note(
    vfs: &dyn Vfs,
    tags: &dyn TagLexer,
    split: SplitMode,
    abs: &Path,
    size: u64,
    mtime_ns: Option<i64>,
) -> (NoteFacts, Option<VfsError>) {
    let bytes = match vfs.read_file(abs) {
        Ok(bytes) => bytes,
        Err(e) => {
            let facts = NoteFacts {
                size,
                ..NoteFacts::default()
            };
            return (facts, Some(e));
        }
    };
    let source = String::from_utf8_lossy(&bytes);
    // Body only: a `[[link]]` in a frontmatter value is a frontmatter edge.
    let (yaml, body) = split_with(&source, split);
    // Parsed only when the YAML could hold a link or a path at all.
    let frontmatter_links =
        if yaml.is_some_and(|y| y.contains("[[") || markdown_link::may_hold_frontmatter_paths(y)) {
            let fm = read_note_with(&source, split).frontmatter;
            let mut links = markdown_link::frontmatter_links(&fm);
            links.extend(markdown_link::frontmatter_paths(&fm));
            links
        } else {
            Vec::new()
        };
    let links = markdown_link::body_links_spanned(body);
    let lines = links.iter().map(|l| line_of(body, l.byte_start)).collect();
    let facts = NoteFacts {
        links,
        lines,
        frontmatter_links,
        tags: tags.lex(body).into_iter().map(dedupe).collect(),
        size,
        mtime_ns,
    };
    (facts, None)
}

/// The 1-indexed line of a byte offset.
fn line_of(body: &str, byte: usize) -> u64 {
    1 + body.as_bytes()[..byte.min(body.len())]
        .iter()
        .filter(|b| **b == b'\n')
        .count() as u64
}

fn dedupe(items: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    items
        .into_iter()
        .filter(|t| seen.insert(t.clone()))
        .collect()
}

/// A [`LinkGraph`]'s paths and links from one sweep. See
/// [`LinkGraph::snapshot`].
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct LinkSnapshot {
    /// Every file the sweep saw, notes and attachments, in
    /// `slug_collate::compare_paths` order.
    pub paths: Vec<String>,
    /// Each note's outgoing body links. See [`LinkGraph::body_links`].
    pub body_links: BTreeMap<String, Vec<BodyLink>>,
    /// Each note's frontmatter references; notes with none are left out. See
    /// [`LinkGraph::frontmatter_links`].
    pub frontmatter_links: BTreeMap<String, Vec<RawLink>>,
}

fn body_links_of(notes: &BTreeMap<String, Arc<NoteFacts>>) -> BTreeMap<String, Vec<BodyLink>> {
    notes
        .iter()
        .map(|(path, facts)| (path.clone(), facts.links.clone()))
        .collect()
}

fn frontmatter_links_of(
    notes: &BTreeMap<String, Arc<NoteFacts>>,
) -> BTreeMap<String, Vec<RawLink>> {
    notes
        .iter()
        .filter(|(_, facts)| !facts.frontmatter_links.is_empty())
        .map(|(path, facts)| (path.clone(), facts.frontmatter_links.clone()))
        .collect()
}

/// A note's body lines, numbered as the graph numbers its links, and how
/// many file lines come before the body.
#[derive(Debug, Clone)]
pub struct NoteBody {
    lines: Vec<String>,
    /// Lines before the body: the frontmatter block and its fences.
    pub offset: u64,
}

impl NoteBody {
    /// Reads `rel` under `vault_dir`, split strictly; `None` when it cannot
    /// be read.
    pub fn read(vfs: &dyn Vfs, vault_dir: &Path, rel: &str) -> Option<NoteBody> {
        NoteBody::read_with(vfs, vault_dir, rel, SplitMode::Strict)
    }

    /// [`NoteBody::read`] with the frontmatter found by `split`.
    pub fn read_with(
        vfs: &dyn Vfs,
        vault_dir: &Path,
        rel: &str,
        split: SplitMode,
    ) -> Option<NoteBody> {
        let bytes = vfs.read_file(&join_rel(vault_dir, rel)).ok()?;
        let source = String::from_utf8_lossy(&bytes);
        let (_, body) = split_with(&source, split);
        let head = &source[..source.len().saturating_sub(body.len())];
        Some(NoteBody {
            lines: body.lines().map(str::to_string).collect(),
            offset: head.bytes().filter(|b| *b == b'\n').count() as u64,
        })
    }

    /// Body line `line` (1-indexed), trimmed.
    pub fn line(&self, line: u64) -> Option<&str> {
        self.lines
            .get(line.checked_sub(1)? as usize)
            .map(|l| l.trim())
    }
}

#[cfg(test)]
pub(crate) mod hooks {
    //! Run once between a sweep's walk and its swap (or an apply's read and
    //! its install), so a test can land a concurrent call exactly there.
    use std::cell::RefCell;
    use std::path::{Path, PathBuf};

    use vfs_seam::{DirEntry, Metadata, Vfs, VfsError};

    type Hook = RefCell<Option<Box<dyn FnOnce()>>>;

    thread_local! {
        static MID_SWEEP: Hook = const { RefCell::new(None) };
        static MID_APPLY: Hook = const { RefCell::new(None) };
    }

    pub fn mid_sweep(f: impl FnOnce() + 'static) {
        MID_SWEEP.with(|h| *h.borrow_mut() = Some(Box::new(f)));
    }

    pub fn mid_apply(f: impl FnOnce() + 'static) {
        MID_APPLY.with(|h| *h.borrow_mut() = Some(Box::new(f)));
    }

    pub fn run_mid_sweep() {
        if let Some(f) = MID_SWEEP.with(|h| h.borrow_mut().take()) {
            f();
        }
    }

    pub fn run_mid_apply() {
        if let Some(f) = MID_APPLY.with(|h| h.borrow_mut().take()) {
            f();
        }
    }

    /// A [`Vfs`] over `inner` with what it reports about one path changed.
    pub struct StatHook<'a> {
        inner: &'a dyn Vfs,
        path: PathBuf,
        on_stat: OnStat<'a>,
    }

    enum OnStat<'a> {
        After(RefCell<Option<Box<dyn FnOnce() + 'a>>>),
        Denied,
        As(PathBuf),
        Unreadable,
    }

    impl<'a> StatHook<'a> {
        /// Runs `then` once, just after the first read of `path` (a stat of
        /// it or a listing of its folder) and before that call returns. So
        /// a test can change the corpus, or land another call, exactly
        /// between a read and what the caller does with it.
        pub fn after(inner: &'a dyn Vfs, path: PathBuf, then: impl FnOnce() + 'a) -> Self {
            StatHook {
                inner,
                path,
                on_stat: OnStat::After(RefCell::new(Some(Box::new(then)))),
            }
        }

        /// Every stat of `path` fails, as a folder readable but not
        /// searchable leaves its files: listed, but no metadata.
        pub fn denied(inner: &'a dyn Vfs, path: PathBuf) -> Self {
            StatHook {
                inner,
                path,
                on_stat: OnStat::Denied,
            }
        }

        /// `path` stats, but cannot be read (a file) or listed (a folder),
        /// as mode 000 leaves it.
        pub fn unreadable(inner: &'a dyn Vfs, path: PathBuf) -> Self {
            StatHook {
                inner,
                path,
                on_stat: OnStat::Unreadable,
            }
        }

        /// A stat of `path` reads `real` instead, as a case-insensitive
        /// file system answers for another spelling of a file.
        pub fn aliased(inner: &'a dyn Vfs, path: PathBuf, real: PathBuf) -> Self {
            StatHook {
                inner,
                path,
                on_stat: OnStat::As(real),
            }
        }
    }

    fn denied(path: &Path) -> VfsError {
        VfsError::io(
            path,
            std::io::Error::from(std::io::ErrorKind::PermissionDenied),
        )
    }

    fn run_once(then: &RefCell<Option<Box<dyn FnOnce() + '_>>>) {
        if let Some(f) = then.borrow_mut().take() {
            f();
        }
    }

    impl Vfs for StatHook<'_> {
        fn metadata(&self, path: &Path) -> Result<Metadata, VfsError> {
            if path != self.path {
                return self.inner.metadata(path);
            }
            match &self.on_stat {
                OnStat::Denied => Err(denied(path)),
                OnStat::As(real) => self.inner.metadata(real),
                OnStat::Unreadable => self.inner.metadata(path),
                OnStat::After(then) => {
                    let meta = self.inner.metadata(path);
                    run_once(then);
                    meta
                }
            }
        }
        fn read_file(&self, path: &Path) -> Result<Vec<u8>, VfsError> {
            if path == self.path && matches!(self.on_stat, OnStat::Unreadable) {
                return Err(denied(path));
            }
            self.inner.read_file(path)
        }
        fn read_dir(&self, path: &Path) -> Result<Vec<DirEntry>, VfsError> {
            if path == self.path && matches!(self.on_stat, OnStat::Unreadable) {
                return Err(denied(path));
            }
            let entries = self.inner.read_dir(path);
            if let OnStat::After(then) = &self.on_stat
                && self.path.parent() == Some(path)
            {
                run_once(then);
            }
            entries
        }
        fn write_file(&self, path: &Path, bytes: &[u8]) -> Result<(), VfsError> {
            self.inner.write_file(path, bytes)
        }
        fn create_dir_all(&self, path: &Path) -> Result<(), VfsError> {
            self.inner.create_dir_all(path)
        }
        fn exists(&self, path: &Path) -> bool {
            self.inner.exists(path)
        }
        fn is_executable(&self, path: &Path) -> bool {
            self.inner.is_executable(path)
        }
        fn set_executable(&self, path: &Path, yes: bool) -> Result<(), VfsError> {
            self.inner.set_executable(path, yes)
        }
        fn rename(&self, from: &Path, to: &Path) -> Result<(), VfsError> {
            self.inner.rename(from, to)
        }
        fn remove(&self, path: &Path) -> Result<(), VfsError> {
            self.inner.remove(path)
        }
        fn is_symlink(&self, path: &Path) -> bool {
            self.inner.is_symlink(path)
        }
        fn canonicalize(&self, path: &Path) -> Result<PathBuf, VfsError> {
            self.inner.canonicalize(path)
        }
        fn sees_links(&self) -> bool {
            self.inner.sees_links()
        }
        fn read_link(&self, path: &Path) -> Result<PathBuf, VfsError> {
            self.inner.read_link(path)
        }
    }
}

#[cfg(test)]
#[path = "links_tests.rs"]
mod tests;
