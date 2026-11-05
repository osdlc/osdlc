use std::rc::Rc;

use vfs_seam::{FixedClock, MemVfs};
use yaml_splice::Value;

use super::*;
use crate::links::hooks::{mid_apply, mid_sweep};

const V: &str = "/v";

fn root() -> &'static Path {
    Path::new(V)
}

fn put(vfs: &MemVfs, rel: &str, content: &str) {
    vfs.insert(join_rel(root(), rel), content).unwrap();
}

fn vault() -> Rc<MemVfs> {
    let d = MemVfs::new();
    put(
        &d,
        "Notes/a.md",
        "---\ntitle: A\nstatus: draft\n---\nbody\n",
    );
    put(&d, "Notes/b.md", "---\ntitle: B\n---\nbody\n");
    put(&d, "_system/config.md", "---\nx: 1\n---\nbody\n");
    Rc::new(d)
}

fn status(index: &FrontmatterIndex, rel: &str) -> Option<String> {
    index
        .get(rel)?
        .frontmatter
        .get("status")
        .and_then(Value::as_str)
        .map(str::to_string)
}

#[test]
fn the_first_refresh_indexes_every_visible_note() {
    let d = vault();
    let index = FrontmatterIndex::new();
    let stats = index.refresh(&*d, &FixedClock::new(0), root());
    assert_eq!(stats.added, 2, "_system/ is not a content note");
    assert_eq!(stats.unchanged, 0);
    assert_eq!(index.len(), 2);
}

#[test]
fn parsed_frontmatter_is_available_without_re_reading_the_note() {
    let d = vault();
    let index = FrontmatterIndex::new();
    index.refresh(&*d, &FixedClock::new(0), root());
    let note = index.get("Notes/a.md").unwrap();
    assert_eq!(note.title, "a", "title is the basename, not `title: A`");
    assert_eq!(status(&index, "Notes/a.md").as_deref(), Some("draft"));
    assert!(note.parse_error.is_none());
}

#[test]
fn a_second_refresh_reuses_every_parse() {
    let d = vault();
    let (index, c) = (FrontmatterIndex::new(), FixedClock::new(0));
    index.refresh(&*d, &c, root());
    let stats = index.refresh_now(&*d, &c, root());
    assert_eq!(stats.unchanged, 2);
    assert!(stats.is_empty(), "nothing moved");
    assert_eq!(index.sweeps(), 2);
}

#[test]
fn a_burst_of_refreshes_inside_the_ttl_shares_one_walk() {
    let d = vault();
    let (index, c) = (FrontmatterIndex::new(), FixedClock::new(0));
    assert_eq!(index.refresh(&*d, &c, root()).added, 2);
    for _ in 0..20 {
        c.advance(10);
        let stats = index.refresh(&*d, &c, root());
        assert_eq!(stats.unchanged, 2, "a coalesced walk reports the cache");
        assert!(stats.is_empty());
    }
    assert_eq!(index.sweeps(), 1, "twenty pages cost one walk");
    c.advance(REFRESH_TTL_MS);
    index.refresh(&*d, &c, root());
    assert_eq!(index.sweeps(), 2, "past the TTL it walks");
    assert_eq!(index.refresh_now(&*d, &c, root()).unchanged, 2);
    assert_eq!(index.sweeps(), 3);
}

#[test]
fn one_page_clones_one_page_and_reports_the_whole_index() {
    let d = vault();
    let index = FrontmatterIndex::new();
    index.refresh(&*d, &FixedClock::new(0), root());
    let (window, total) = index.page(0, Some(1));
    assert_eq!(window.len(), 1);
    assert_eq!(total, 2);
    assert_eq!(window[0].path, "Notes/a.md");
    assert_eq!(index.page(1, Some(1)).0[0].path, "Notes/b.md");
    assert!(index.page(99, Some(1)).0.is_empty());
    assert!(Arc::ptr_eq(&window[0], &index.page(0, Some(1)).0[0]));
    assert_eq!(index.all().len(), 2);
}

#[test]
fn a_watched_index_stays_fresh_past_the_short_ttl_until_marked_stale() {
    let d = vault();
    let (index, c) = (FrontmatterIndex::new(), FixedClock::new(0));
    index.set_watched();
    index.refresh(&*d, &c, root());
    c.advance(600);
    index.refresh(&*d, &c, root());
    assert_eq!(index.sweeps(), 1, "past 500ms, a watched index reuses");
    index.mark_stale();
    index.refresh(&*d, &c, root());
    assert_eq!(index.sweeps(), 2);
}

#[test]
fn mark_stale_during_a_sweep_survives_the_swap() {
    let d = vault();
    let (index, c) = (Arc::new(FrontmatterIndex::new()), FixedClock::new(0));
    index.set_watched();
    index.refresh(&*d, &c, root());

    let (i, dd) = (Arc::clone(&index), Rc::clone(&d));
    mid_sweep(move || {
        dd.rename(&join_rel(root(), "Notes"), &join_rel(root(), "Moved"))
            .unwrap();
        i.mark_stale();
    });
    index.refresh_now(&*d, &c, root());

    index.refresh(&*d, &c, root());
    assert_eq!(
        index.sweeps(),
        3,
        "the stale mark made the next refresh walk"
    );
    assert!(index.get("Notes/a.md").is_none());
    assert!(index.get("Moved/a.md").is_some());
}

#[test]
fn invalidate_during_a_sweep_is_not_undone_by_the_swap() {
    let d = vault();
    let (index, c) = (Arc::new(FrontmatterIndex::new()), FixedClock::new(0));
    index.set_watched();
    index.refresh(&*d, &c, root());

    let (i, dd) = (Arc::clone(&index), Rc::clone(&d));
    mid_sweep(move || {
        put(
            &dd,
            "Notes/a.md",
            "---\ntitle: A\nstatus: shipped\n---\nbody\n",
        );
        i.invalidate("Notes/a.md");
    });
    index.refresh_now(&*d, &c, root());

    index.refresh(&*d, &c, root());
    assert_eq!(status(&index, "Notes/a.md").as_deref(), Some("shipped"));
}

#[test]
fn clear_during_a_sweep_is_not_undone_by_the_swap() {
    let d = vault();
    let (index, c) = (Arc::new(FrontmatterIndex::new()), FixedClock::new(0));
    index.set_watched();
    index.refresh(&*d, &c, root());

    let i = Arc::clone(&index);
    mid_sweep(move || i.clear());
    index.refresh_now(&*d, &c, root());

    assert!(index.is_empty(), "the cleared entries did not come back");
    assert_eq!(index.refresh(&*d, &c, root()).added, 2);
}

#[test]
fn apply_change_during_a_cold_sweep_is_not_lost() {
    let d = vault();
    let (index, c) = (Arc::new(FrontmatterIndex::new()), FixedClock::new(0));
    index.set_watched();

    let (i, dd) = (Arc::clone(&index), Rc::clone(&d));
    mid_sweep(move || {
        put(
            &dd,
            "Notes/a.md",
            "---\ntitle: A\nstatus: NEW-and-longer\n---\nbody\n",
        );
        i.apply_change(&*dd, root(), "Notes/a.md");
    });
    index.refresh(&*d, &c, root());

    index.refresh(&*d, &c, root());
    assert_eq!(
        status(&index, "Notes/a.md").as_deref(),
        Some("NEW-and-longer")
    );
}

#[test]
fn an_apply_installs_what_it_read() {
    let d = vault();
    let (index, c) = (FrontmatterIndex::new(), FixedClock::new(0));
    index.refresh_now(&*d, &c, root());
    put(
        &d,
        "Notes/a.md",
        "---\ntitle: A\nstatus: first\n---\nbody\n",
    );
    let dd = Rc::clone(&d);
    mid_apply(move || {
        put(
            &dd,
            "Notes/a.md",
            "---\ntitle: A\nstatus: second\n---\nbody\n",
        )
    });
    index.apply_change(&*d, root(), "Notes/a.md");
    assert_eq!(status(&index, "Notes/a.md").as_deref(), Some("first"));
    index.refresh_now(&*d, &c, root());
    assert_eq!(status(&index, "Notes/a.md").as_deref(), Some("second"));
}

#[test]
fn a_vault_switch_always_bypasses_the_ttl() {
    let a = vault();
    let b = MemVfs::new();
    b.insert("/w/Only.md", "---\ntitle: Only\n---\nbody\n")
        .unwrap();
    let (index, c) = (FrontmatterIndex::new(), FixedClock::new(0));
    index.refresh(&*a, &c, root());
    let stats = index.refresh(&b, &c, Path::new("/w"));
    assert_eq!(stats.added, 1);
    assert_eq!(index.len(), 1);
    assert!(index.get("Notes/a.md").is_none());
}

#[test]
fn a_switch_to_an_empty_corpus_counts_as_a_change() {
    let a = vault();
    a.create_dir_all(Path::new("/w")).unwrap();
    let (index, c) = (FrontmatterIndex::new(), FixedClock::new(0));
    index.refresh(&*a, &c, root());
    let before = index.changes();
    index.refresh(&*a, &c, Path::new("/w"));
    assert!(index.is_empty());
    assert_eq!(index.changes(), before + 1, "two notes became none");
}

#[test]
fn an_apply_cannot_undo_a_later_apply_with_what_it_read_first() {
    // An atomic save: the note is gone for a moment, then back.
    let d = vault();
    let (index, c) = (FrontmatterIndex::new(), FixedClock::new(0));
    index.refresh(&*d, &c, root());
    d.remove(&join_rel(root(), "Notes/a.md")).unwrap();
    let later_ran = std::cell::Cell::new(false);
    // Apply A stats the note while it is gone. Before A acts on that, the
    // note comes back and apply B reads it, unless A already holds the
    // apply lock, in which case B must wait for A.
    let vfs = crate::links::hooks::StatHook::after(&*d, join_rel(root(), "Notes/a.md"), || {
        put(&d, "Notes/a.md", "---\nstatus: back\n---\nbody\n");
        if let Ok(free) = index.apply_lock.try_lock() {
            drop(free);
            index.apply_change(&*d, root(), "Notes/a.md");
            later_ran.set(true);
        }
    });
    index.apply_change(&vfs, root(), "Notes/a.md");
    if !later_ran.get() {
        index.apply_change(&*d, root(), "Notes/a.md");
    }
    assert_eq!(status(&index, "Notes/a.md").as_deref(), Some("back"));
}

#[test]
fn a_note_with_no_modification_time_is_retried_instead_of_cached_forever() {
    let d = vault();
    let (index, c) = (FrontmatterIndex::new(), FixedClock::new(0));
    d.set_modified_ns(&join_rel(root(), "Notes/b.md"), None)
        .unwrap();
    index.refresh(&*d, &c, root());
    let second = index.refresh_now(&*d, &c, root());
    assert_eq!(second.unchanged, 1);
    assert_eq!(
        second.updated, 1,
        "a note that cannot be stamped is retried"
    );
}

#[test]
fn a_changed_note_is_re_parsed_and_a_stale_value_never_survives() {
    let d = vault();
    let (index, c) = (FrontmatterIndex::new(), FixedClock::new(0));
    index.refresh(&*d, &c, root());
    put(
        &d,
        "Notes/a.md",
        "---\ntitle: A\nstatus: published\n---\nbody\n",
    );
    let stats = index.refresh_now(&*d, &c, root());
    assert_eq!(stats.updated, 1);
    assert_eq!(stats.unchanged, 1);
    assert_eq!(status(&index, "Notes/a.md").as_deref(), Some("published"));
}

#[test]
fn a_deleted_note_leaves_the_index() {
    let d = vault();
    let (index, c) = (FrontmatterIndex::new(), FixedClock::new(0));
    index.refresh(&*d, &c, root());
    d.remove(&join_rel(root(), "Notes/b.md")).unwrap();
    let stats = index.refresh_now(&*d, &c, root());
    assert_eq!(stats.removed, 1);
    assert_eq!(index.len(), 1);
    assert!(index.get("Notes/b.md").is_none());
}

#[test]
fn a_new_note_is_added_without_disturbing_the_others() {
    let d = vault();
    let (index, c) = (FrontmatterIndex::new(), FixedClock::new(0));
    index.refresh(&*d, &c, root());
    put(&d, "Notes/c.md", "---\ntitle: C\n---\nbody\n");
    let stats = index.refresh_now(&*d, &c, root());
    assert_eq!(stats.added, 1);
    assert_eq!(stats.unchanged, 2);
}

#[test]
fn invalidate_forces_a_re_parse_of_exactly_one_note() {
    let d = vault();
    let (index, c) = (FrontmatterIndex::new(), FixedClock::new(0));
    index.refresh(&*d, &c, root());
    let before = index.changes();
    index.invalidate("Notes/a.md");
    assert_eq!(index.changes(), before + 1);
    let stats = index.refresh(&*d, &c, root());
    assert_eq!(stats.added, 1, "the forgotten note comes back as added");
    assert_eq!(stats.unchanged, 1);
}

#[test]
fn apply_change_updates_one_note_without_a_walk_and_keeps_freshness() {
    let d = vault();
    let (index, c) = (FrontmatterIndex::new(), FixedClock::new(0));
    index.refresh(&*d, &c, root());
    assert_eq!(index.sweeps(), 1);

    put(
        &d,
        "Notes/a.md",
        "---\ntitle: A\nstatus: shipped\n---\nbody\n",
    );
    index.apply_change(&*d, root(), "Notes/a.md");
    assert_eq!(status(&index, "Notes/a.md").as_deref(), Some("shipped"));

    d.remove(&join_rel(root(), "Notes/b.md")).unwrap();
    index.apply_change(&*d, root(), "Notes/b.md");
    assert!(index.get("Notes/b.md").is_none(), "a delete removes");

    assert_eq!(index.sweeps(), 1, "no walk happened");
    assert!(index.refresh(&*d, &c, root()).is_empty());
    assert_eq!(index.sweeps(), 1);
}

#[test]
fn apply_change_ignores_paths_the_index_would_never_walk_and_cold_caches() {
    let d = vault();
    let (index, c) = (FrontmatterIndex::new(), FixedClock::new(0));
    index.apply_change(&*d, root(), "Notes/a.md");
    assert!(index.is_empty());

    index.refresh(&*d, &c, root());
    index.apply_change(&*d, root(), "_system/config.md");
    assert!(index.get("_system/config.md").is_none());
    index.apply_change(&*d, root(), "Notes/photo.png");
    assert!(index.get("Notes/photo.png").is_none());
}

#[test]
fn excluded_files_are_left_out_of_the_walk_and_the_apply() {
    let d = vault();
    put(
        &d,
        ".obsidian/app.json",
        r#"{"userIgnoreFilters":["Notes/b"]}"#,
    );
    let (index, c) = (FrontmatterIndex::new(), FixedClock::new(0));
    index.refresh(&*d, &c, root());
    assert!(index.get("Notes/b.md").is_none());
    put(&d, "Notes/b.md", "---\ntitle: B2\n---\n");
    index.apply_change(&*d, root(), "Notes/b.md");
    assert!(index.get("Notes/b.md").is_none());
}

#[test]
fn clear_forgets_everything() {
    let d = vault();
    let (index, c) = (FrontmatterIndex::new(), FixedClock::new(0));
    index.refresh(&*d, &c, root());
    let before = index.changes();
    index.clear();
    assert!(index.is_empty());
    assert_eq!(index.changes(), before + 1, "emptied");
    index.clear();
    assert_eq!(index.changes(), before + 1, "already empty");
    assert_eq!(index.refresh(&*d, &c, root()).added, 2);
}

#[test]
fn apply_change_drops_the_old_spelling_of_a_case_only_rename() {
    let d = vault();
    let (index, c) = (FrontmatterIndex::new(), FixedClock::new(0));
    index.refresh(&*d, &c, root());
    d.rename(
        &join_rel(root(), "Notes/a.md"),
        &join_rel(root(), "Notes/A.md"),
    )
    .unwrap();
    // A case-insensitive file system still stats the old spelling.
    let vfs = crate::links::hooks::StatHook::aliased(
        &*d,
        join_rel(root(), "Notes/a.md"),
        join_rel(root(), "Notes/A.md"),
    );
    index.apply_changes(&vfs, root(), &["Notes/a.md".into(), "Notes/A.md".into()]);
    let paths = || -> Vec<String> {
        let (notes, _) = index.page(0, None);
        notes.iter().map(|n| n.path.clone()).collect()
    };
    let applied = paths();
    index.refresh_now(&vfs, &c, root());
    let swept = paths();
    assert_eq!(swept, ["Notes/A.md", "Notes/b.md"]);
    assert_eq!(applied, swept, "the apply agrees with the sweep");
}

#[test]
fn a_malformed_note_is_indexed_with_a_diagnostic_rather_than_skipped() {
    let d = vault();
    put(&d, "Notes/broken.md", "---\na: [1, 2\nb: }{\n---\nBODY\n");
    let index = FrontmatterIndex::new();
    index.refresh(&*d, &FixedClock::new(0), root());
    let note = index.get("Notes/broken.md").expect("still indexed");
    assert!(note.parse_error.is_some());
    assert!(note.frontmatter.is_empty());
    assert_eq!(index.len(), 3);
}

#[test]
fn the_stamp_keeps_the_nanoseconds() {
    let d = vault();
    let b = join_rel(root(), "Notes/b.md");
    d.set_modified_ns(&b, Some(1_784_508_521_000_015_838))
        .unwrap();
    let (index, c) = (FrontmatterIndex::new(), FixedClock::new(0));
    index.refresh(&*d, &c, root());
    let note = index.get("Notes/b.md").unwrap();
    assert_eq!(note.mtime_ns, Some(1_784_508_521_000_015_838));
    assert_eq!(note.mtime_ms_f64(), Some(1_784_508_521_000.015_9));

    put(&d, "Notes/b.md", "---\ntitle: Z\n---\nbody\n");
    d.set_modified_ns(&b, Some(1_784_508_521_000_015_839))
        .unwrap();
    assert_eq!(index.refresh_now(&*d, &c, root()).updated, 1);
}

#[test]
fn a_same_size_edit_with_the_same_time_is_the_documented_blind_spot() {
    let d = vault();
    let (index, c) = (FrontmatterIndex::new(), FixedClock::new(0));
    index.refresh(&*d, &c, root());
    let before = index.get("Notes/b.md").unwrap();

    put(&d, "Notes/b.md", "---\ntitle: Z\n---\nbody\n");
    d.set_modified_ns(&join_rel(root(), "Notes/b.md"), before.mtime_ns)
        .unwrap();
    let stats = index.refresh_now(&*d, &c, root());
    assert_eq!(stats.unchanged, 2, "the edit is invisible to (mtime, size)");

    index.invalidate("Notes/b.md");
    index.refresh(&*d, &c, root());
    assert_eq!(
        index
            .get("Notes/b.md")
            .unwrap()
            .frontmatter
            .get("title")
            .and_then(Value::as_str),
        Some("Z")
    );
}

#[test]
fn the_index_is_send_and_sync() {
    fn assert_send_sync<T: Send + Sync>() {}
    assert_send_sync::<FrontmatterIndex>();
}

#[cfg(feature = "native")]
mod native {
    use std::sync::mpsc;
    use std::time::Duration;

    use vfs_seam::{NativeVfs, SystemClock};

    use super::*;

    fn write(dir: &Path, rel: &str, content: &str) {
        let p = dir.join(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, content).unwrap();
    }

    #[test]
    fn overlapping_applies_for_one_note_install_the_later_parse() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "Notes/a.md", "---\nstatus: draft\n---\nbody\n");
        let index = Arc::new(FrontmatterIndex::new());
        index.refresh_now(&NativeVfs, &SystemClock, d.path());
        write(d.path(), "Notes/a.md", "---\nstatus: first\n---\nbody\n");

        let (i, root) = (Arc::clone(&index), d.path().to_path_buf());
        let second = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&second);
        mid_apply(move || {
            let (tx, rx) = mpsc::channel();
            let h = std::thread::spawn(move || {
                write(&root, "Notes/a.md", "---\nstatus: second\n---\nbody\n");
                i.apply_change(&NativeVfs, &root, "Notes/a.md");
                let _ = tx.send(());
            });
            let _ = rx.recv_timeout(Duration::from_millis(500));
            *slot.lock().unwrap() = Some(h);
        });
        index.apply_change(&NativeVfs, d.path(), "Notes/a.md");
        second.lock().unwrap().take().unwrap().join().unwrap();
        assert_eq!(status(&index, "Notes/a.md").as_deref(), Some("second"));
    }

    #[cfg(unix)]
    #[test]
    fn a_dangling_symlink_is_retried_until_its_target_arrives() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "Notes/a.md", "---\nstatus: draft\n---\nbody\n");
        std::os::unix::fs::symlink(
            d.path().join("Notes/not-yet-there.md"),
            d.path().join("Notes/dangling.md"),
        )
        .unwrap();
        let index = FrontmatterIndex::new();
        assert_eq!(index.refresh(&NativeVfs, &SystemClock, d.path()).added, 2);
        let second = index.refresh_now(&NativeVfs, &SystemClock, d.path());
        assert_eq!((second.unchanged, second.updated), (1, 1));

        write(
            d.path(),
            "Notes/not-yet-there.md",
            "---\nstatus: final\n---\nbody\n",
        );
        index.refresh_now(&NativeVfs, &SystemClock, d.path());
        assert_eq!(
            status(&index, "Notes/dangling.md").as_deref(),
            Some("final")
        );
    }

    #[cfg(unix)]
    #[test]
    fn an_apply_keeps_a_dangling_symlink_the_walk_lists() {
        let d = tempfile::tempdir().unwrap();
        write(d.path(), "Notes/a.md", "---\nstatus: draft\n---\nbody\n");
        std::os::unix::fs::symlink(
            d.path().join("Notes/not-yet-there.md"),
            d.path().join("Notes/dangling.md"),
        )
        .unwrap();
        let index = FrontmatterIndex::new();
        index.refresh(&NativeVfs, &SystemClock, d.path());
        assert!(index.get("Notes/dangling.md").is_some());
        index.apply_change(&NativeVfs, d.path(), "Notes/dangling.md");
        let kept = index
            .get("Notes/dangling.md")
            .expect("as the walk lists it");
        assert!(kept.parse_error.is_some());
        assert_eq!(kept.mtime_ns, None, "never fresh, so a sweep retries it");
    }
}
