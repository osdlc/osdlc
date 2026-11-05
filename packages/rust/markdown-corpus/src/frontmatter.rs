//! The incremental frontmatter index: every content note's parsed
//! frontmatter, kept.
//!
//! [`FrontmatterIndex`] walks the content notes (no `_system/`, no dot
//! folders, no excluded files), reads each note through [`read_note`](crate::read_note) and
//! keeps the parse. It follows [`crate::links`]'s rules: `(size, mtime)`
//! freshness, a TTL from the caller's [`Clock`], reads with no lock held, and
//! a sweep from before a corpus switch, an apply, an invalidate or a clear is
//! not installed.
//!
//! A malformed note is kept with an empty mapping and
//! [`IndexedNote::parse_error`] set: a projection never dies on one bad note
//! and never pretends it is not there.
//!
//! # The walk
//!
//! [`FrontmatterIndex::default_walk`] is the content walk above.
//! [`FrontmatterIndex::with_walk`] replaces it, for example with a tool's own
//! excluded files as [`Hide::Rules`](markdown_vault_fs::walk::Hide::Rules).
//! Every answer follows it: the walk, [`FrontmatterIndex::apply_change`]
//! (which takes a path only when the walk would list it),
//! [`FrontmatterIndex::changes`], [`FrontmatterIndex::page`] and
//! [`FrontmatterIndex::len`]. [`FrontmatterIndex::with_split`] picks how
//! each note's block is found.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use markdown_vault_fs::walk::{WalkError, WalkOptions};
use vfs_seam::{Clock, Vfs};
use yaml_splice::Mapping;

use crate::links::{REFRESH_TTL_MS, WATCHED_TTL_MS, join_rel, stamp_of};
use crate::note::{SplitMode, note_title, read_note_with};

/// One note's cached parse.
#[derive(Debug, Clone, PartialEq)]
pub struct IndexedNote {
    /// Corpus-relative path.
    pub path: String,
    /// The file name without `.md`.
    pub title: String,
    /// The parsed frontmatter. Empty for a note with none, and for one whose
    /// frontmatter does not parse.
    pub frontmatter: Mapping,
    /// Why the frontmatter did not parse, when it did not.
    pub parse_error: Option<String>,
    /// Size in bytes when read.
    pub size: u64,
    /// Modification time in nanoseconds when read. `None` is never fresh.
    pub mtime_ns: Option<i64>,
}

impl IndexedNote {
    /// [`IndexedNote::mtime_ns`] in fractional milliseconds, equal to node's
    /// `statSync().mtimeMs` for the file as read ([`vfs_seam::ns_to_ms_f64`]).
    pub fn mtime_ms_f64(&self) -> Option<f64> {
        self.mtime_ns.map(vfs_seam::ns_to_ms_f64)
    }
}

/// What a refresh changed.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RefreshStats {
    /// Notes seen for the first time.
    pub added: usize,
    /// Notes re-parsed because their stamp moved.
    pub updated: usize,
    /// Notes that are gone.
    pub removed: usize,
    /// Notes whose stamp matched, so their parse was reused.
    pub unchanged: usize,
}

impl RefreshStats {
    /// Whether nothing moved.
    pub fn is_empty(&self) -> bool {
        self.added == 0 && self.updated == 0 && self.removed == 0
    }
}

type NoteMap = BTreeMap<String, Arc<IndexedNote>>;

#[derive(Debug, Default)]
struct IndexState {
    entries: Arc<NoteMap>,
    for_vault: Option<PathBuf>,
    walked_at: Option<i64>,
    generation: u64,
    applied: u64,
    stale_marks: u64,
}

/// A cached, incrementally refreshed parse of every content note. `Send +
/// Sync`: the file system and clock are passed to each call.
#[derive(Debug, Default)]
pub struct FrontmatterIndex {
    state: Mutex<IndexState>,
    sweeps: AtomicU64,
    changes: AtomicU64,
    watched: AtomicBool,
    apply_lock: Mutex<()>,
    walk: WalkOptions,
    split: SplitMode,
}

impl FrontmatterIndex {
    /// An empty index.
    pub fn new() -> Self {
        FrontmatterIndex::default()
    }

    /// The walk an index uses unless told otherwise: content notes only (no
    /// `_system/`, no dot folders) and the corpus's own excluded files.
    pub fn default_walk() -> WalkOptions {
        WalkOptions::content_notes()
    }

    /// This index, walking with `walk` instead of [`Self::default_walk`].
    /// Only notes are indexed, whatever else the walk lists. Set it before
    /// the first refresh.
    pub fn with_walk(mut self, walk: WalkOptions) -> Self {
        self.walk = walk;
        self
    }

    /// This index, finding each note's frontmatter by `split`.
    pub fn with_split(mut self, split: SplitMode) -> Self {
        self.split = split;
        self
    }

    /// The walk this index sweeps with.
    pub fn walk_options(&self) -> &WalkOptions {
        &self.walk
    }

    /// Walks the corpus and brings the index up to date, reusing a walk
    /// younger than the TTL over the same corpus. A walk error leaves the
    /// index as it was and reports nothing changed;
    /// [`Self::try_refresh`] returns it.
    pub fn refresh(&self, vfs: &dyn Vfs, clock: &dyn Clock, vault_dir: &Path) -> RefreshStats {
        self.try_refresh(vfs, clock, vault_dir).unwrap_or_default()
    }

    /// [`Self::refresh`] that always walks.
    pub fn refresh_now(&self, vfs: &dyn Vfs, clock: &dyn Clock, vault_dir: &Path) -> RefreshStats {
        self.try_refresh_now(vfs, clock, vault_dir)
            .unwrap_or_default()
    }

    /// [`Self::refresh`] that returns a walk error instead of leaving the
    /// index as it was. Only a walk that refuses symlinks or propagates
    /// errors can fail.
    pub fn try_refresh(
        &self,
        vfs: &dyn Vfs,
        clock: &dyn Clock,
        vault_dir: &Path,
    ) -> Result<RefreshStats, WalkError> {
        self.sweep(vfs, clock.now_ms(), vault_dir, true)
    }

    /// [`Self::refresh_now`] that returns a walk error.
    pub fn try_refresh_now(
        &self,
        vfs: &dyn Vfs,
        clock: &dyn Clock,
        vault_dir: &Path,
    ) -> Result<RefreshStats, WalkError> {
        self.sweep(vfs, clock.now_ms(), vault_dir, false)
    }

    /// How many walks this index has done.
    pub fn sweeps(&self) -> u64 {
        self.sweeps.load(Ordering::SeqCst)
    }

    /// How many times the entries changed. Bumped with the data, inside the
    /// swap, so a reader that sees a new count reads the new entries. The
    /// counter a derived cache keys on.
    pub fn changes(&self) -> u64 {
        self.changes.load(Ordering::SeqCst)
    }

    /// Says the corpus is under a filesystem watch, so a walk stays fresh for
    /// [`WATCHED_TTL_MS`]. One-way.
    pub fn set_watched(&self) {
        self.watched.store(true, Ordering::SeqCst);
    }

    /// Drops the freshness stamp so the next refresh walks, keeping the
    /// entries for reuse.
    pub fn mark_stale(&self) {
        let mut state = self.state.lock().unwrap();
        state.walked_at = None;
        state.stale_marks += 1;
    }

    fn ttl(&self) -> i64 {
        if self.watched.load(Ordering::SeqCst) {
            WATCHED_TTL_MS
        } else {
            REFRESH_TTL_MS
        }
    }

    fn sweep(
        &self,
        vfs: &dyn Vfs,
        now: i64,
        vault_dir: &Path,
        honor_ttl: bool,
    ) -> Result<RefreshStats, WalkError> {
        let (generation, applied, stale_marks, cache) = {
            let mut state = self.state.lock().unwrap();
            if state.for_vault.as_deref() == Some(vault_dir) {
                if honor_ttl
                    && let Some(done) = state.walked_at
                    && (0..self.ttl()).contains(&(now - done))
                {
                    return Ok(RefreshStats {
                        unchanged: state.entries.len(),
                        ..RefreshStats::default()
                    });
                }
            } else {
                state.entries = Arc::default();
                state.for_vault = Some(vault_dir.to_path_buf());
                state.walked_at = None;
                state.generation += 1;
            }
            (
                state.generation,
                state.applied,
                state.stale_marks,
                Arc::clone(&state.entries),
            )
        };
        self.sweeps.fetch_add(1, Ordering::SeqCst);

        let entries = markdown_vault_fs::walk::walk(vfs, vault_dir, &self.walk)?;
        let mut stats = RefreshStats::default();
        let mut seen: NoteMap = BTreeMap::new();

        for entry in entries.into_iter().filter(|e| e.is_note) {
            let stamp = if entry.is_symlink {
                stamp_of(vfs, &entry.abs)
            } else {
                entry.mtime_ns.map(|m| (entry.size, m))
            };
            if let Some((size, mtime)) = stamp
                && let Some(cached) = cache.get(&entry.rel)
                && cached.size == size
                && cached.mtime_ns == Some(mtime)
            {
                stats.unchanged += 1;
                seen.insert(entry.rel.clone(), Arc::clone(cached));
                continue;
            }
            let (size, mtime) = match stamp {
                Some((size, mtime)) => (size, Some(mtime)),
                None => (entry.size, None),
            };
            let existed = cache.contains_key(&entry.rel);
            let note = parse_one(vfs, self.split, &entry.rel, &entry.abs, size, mtime);
            if existed {
                stats.updated += 1;
            } else {
                stats.added += 1;
            }
            seen.insert(entry.rel, Arc::new(note));
        }
        stats.removed = cache.keys().filter(|k| !seen.contains_key(*k)).count();

        #[cfg(test)]
        crate::links::hooks::run_mid_sweep();

        let mut state = self.state.lock().unwrap();
        if state.generation == generation && state.applied == applied {
            state.entries = Arc::new(seen);
            if state.stale_marks == stale_marks {
                state.walked_at = Some(now);
            }
            if !stats.is_empty() {
                self.changes.fetch_add(1, Ordering::SeqCst);
            }
        }
        Ok(stats)
    }

    /// One note's cached parse. Does not refresh.
    pub fn get(&self, rel: &str) -> Option<Arc<IndexedNote>> {
        self.state.lock().unwrap().entries.get(rel).cloned()
    }

    /// Every note, ascending by path.
    pub fn all(&self) -> Vec<Arc<IndexedNote>> {
        self.state
            .lock()
            .unwrap()
            .entries
            .values()
            .cloned()
            .collect()
    }

    /// One window of [`Self::all`], and the total it came out of. Clones the
    /// window only.
    pub fn page(&self, offset: usize, limit: Option<usize>) -> (Vec<Arc<IndexedNote>>, usize) {
        let entries = &self.state.lock().unwrap().entries;
        let window = entries
            .values()
            .skip(offset)
            .take(limit.unwrap_or(usize::MAX))
            .cloned()
            .collect();
        (window, entries.len())
    }

    /// How many notes are indexed.
    pub fn len(&self) -> usize {
        self.state.lock().unwrap().entries.len()
    }

    /// Whether no note is indexed.
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Brings one note's entry up to date (re-stat, re-parse, or remove when
    /// it is gone) without a walk, keeping the freshness stamp.
    ///
    /// A path the index's walk would not yield ([`WalkOptions::admits`]), a
    /// file that is not a note, or a call against another corpus, does
    /// nothing. With no fresh walk to edit it only marks the index, so a walk
    /// that read the note before the change is not stamped fresh.
    pub fn apply_change(&self, vfs: &dyn Vfs, vault_dir: &Path, rel: &str) {
        if !rel.to_lowercase().ends_with(".md") || !self.walk.admits(vfs, vault_dir, rel) {
            return;
        }
        let _apply = self.apply_lock.lock().unwrap();
        {
            let mut state = self.state.lock().unwrap();
            if state.for_vault.as_deref() != Some(vault_dir) {
                return;
            }
            if state.walked_at.is_none() {
                state.stale_marks += 1;
                return;
            }
        }
        let abs = join_rel(vault_dir, rel);
        let parsed = stamp_of(vfs, &abs)
            .map(|(size, mtime)| parse_one(vfs, self.split, rel, &abs, size, Some(mtime)));

        #[cfg(test)]
        crate::links::hooks::run_mid_apply();

        let mut state = self.state.lock().unwrap();
        if state.for_vault.as_deref() != Some(vault_dir) {
            return;
        }
        state.applied += 1;
        let entries = Arc::make_mut(&mut state.entries);
        match parsed {
            Some(note) => {
                entries.insert(rel.to_string(), Arc::new(note));
            }
            None => {
                entries.remove(rel);
            }
        }
        // Counted even when the re-parse is identical: over-counting costs a
        // derived cache one rebuild, under-counting would leave it stale.
        self.changes.fetch_add(1, Ordering::SeqCst);
    }

    /// Forgets one note, so the next refresh re-parses it, and drops the
    /// freshness stamp so that refresh walks.
    pub fn invalidate(&self, rel: &str) {
        let mut state = self.state.lock().unwrap();
        if state.entries.contains_key(rel) {
            Arc::make_mut(&mut state.entries).remove(rel);
            self.changes.fetch_add(1, Ordering::SeqCst);
        }
        state.walked_at = None;
        state.applied += 1;
    }

    /// Forgets everything.
    pub fn clear(&self) {
        let mut state = self.state.lock().unwrap();
        state.entries = Arc::default();
        state.walked_at = None;
        state.applied += 1;
    }
}

fn parse_one(
    vfs: &dyn Vfs,
    split: SplitMode,
    rel: &str,
    abs: &Path,
    size: u64,
    mtime_ns: Option<i64>,
) -> IndexedNote {
    let title = note_title(rel);
    let Ok(bytes) = vfs.read_file(abs) else {
        return IndexedNote {
            path: rel.to_string(),
            title,
            frontmatter: Mapping::new(),
            parse_error: Some("could not read the file".into()),
            size,
            mtime_ns,
        };
    };
    let note = read_note_with(&String::from_utf8_lossy(&bytes), split);
    IndexedNote {
        path: rel.to_string(),
        title,
        frontmatter: note.frontmatter,
        parse_error: note.parse_error,
        size,
        mtime_ns,
    }
}

#[cfg(test)]
#[path = "frontmatter_tests.rs"]
mod tests;
