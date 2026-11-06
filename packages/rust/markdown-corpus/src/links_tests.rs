use std::rc::Rc;

use vfs_seam::{FixedClock, MemVfs};

use super::hooks::{mid_apply, mid_sweep};
use super::*;

const V: &str = "/v";

fn root() -> &'static Path {
    Path::new(V)
}

fn vault(files: &[(&str, &str)]) -> Rc<MemVfs> {
    let vfs = MemVfs::new();
    for (rel, body) in files {
        put(&vfs, rel, body);
    }
    Rc::new(vfs)
}

fn put(vfs: &MemVfs, rel: &str, content: &str) {
    vfs.insert(join_rel(root(), rel), content).unwrap();
}

fn rm(vfs: &MemVfs, rel: &str) {
    vfs.remove(&join_rel(root(), rel)).unwrap();
}

/// `#word` tokens outside code in slot 0, and the same upper-cased in slot 1,
/// so the slot handling is visible.
fn test_tags() -> Arc<dyn TagLexer + Send + Sync> {
    Arc::new(|body: &str| {
        let plain = markdown_link::strip_code(body);
        let tags: Vec<String> = plain
            .split_whitespace()
            .filter_map(|w| w.strip_prefix('#'))
            .map(|t| t.trim_end_matches(['.', ',', ')']).to_string())
            .filter(|t| !t.is_empty())
            .collect();
        let upper = tags.iter().map(|t| t.to_uppercase()).collect();
        vec![tags, upper]
    })
}

fn graph() -> LinkGraph {
    LinkGraph::with_tags(test_tags())
}

/// The fixture link shapes: bare-name, pathed, aliased, embedded, heading-
/// and block-anchored, frontmatter, and unresolved.
fn linked_vault() -> Rc<MemVfs> {
    vault(&[
        (
            "Home.md",
            "---\ntitle: Home\n---\n# Home\n\nSee [[Projects/Alpha]] for the flagship,\n\
             or [[Projects/Alpha|the alpha project]].\n\nMissing: [[Missing Note]].\n\n#home\n",
        ),
        (
            "Projects/Alpha.md",
            "---\ntags: [project, active]\n---\n# Alpha\n\nAn #inline-tag here.\n",
        ),
        (
            "Projects/Beta.md",
            "---\ntags: [project]\ncover: \"[[Home]]\"\n---\n![[Home]]\n\n![[assets/diagram.svg]]\n\n\
             Heading link: [[Projects/Alpha#Goals]].\n\nBlock link: [[Alpha#^blk]].\n",
        ),
        ("assets/diagram.svg", "<svg/>"),
        ("_system/config.md", "---\nx: 1\n---\nLinks to [[Home]].\n"),
    ])
}

fn back_of(g: &LinkGraph, path: &str) -> Vec<Backlink> {
    g.backlinks(path).backlinks
}

// ── Refresh mechanics ──────────────────────────────────────────────────

#[test]
fn a_first_refresh_scans_every_note_and_indexes_the_attachments_too() {
    let d = linked_vault();
    let g = graph();
    let stats = g.refresh(&*d, &FixedClock::new(0), root());
    assert_eq!(stats.added, 4, "three content notes plus _system/config.md");
    assert_eq!(stats.unchanged, 0);
    assert!(stats.resolvable > 4, "the svg too: {}", stats.resolvable);
}

#[test]
fn a_second_refresh_reuses_every_scan() {
    let d = linked_vault();
    let (g, c) = (graph(), FixedClock::new(0));
    g.refresh(&*d, &c, root());
    let stats = g.refresh(&*d, &c, root());
    assert_eq!(stats.unchanged, 4);
    assert_eq!(stats.added + stats.updated + stats.removed, 0);
}

#[test]
fn an_edited_note_is_rescanned_and_its_edges_change() {
    let d = linked_vault();
    let (g, c) = (graph(), FixedClock::new(0));
    g.refresh(&*d, &c, root());
    assert_eq!(back_of(&g, "Projects/Alpha.md").len(), 2);

    put(&d, "Home.md", "# Home\n\nNothing links out now.\n");
    let stats = g.refresh_now(&*d, &c, root());
    assert_eq!(stats.updated, 1);
    let back = back_of(&g, "Projects/Alpha.md");
    assert_eq!(back.len(), 1, "only Beta still links to Alpha");
    assert_eq!(back[0].source_path, "Projects/Beta.md");
}

#[test]
fn a_deleted_note_leaves_the_graph() {
    let d = linked_vault();
    let (g, c) = (graph(), FixedClock::new(0));
    g.refresh(&*d, &c, root());
    rm(&d, "Projects/Beta.md");
    let stats = g.refresh_now(&*d, &c, root());
    assert_eq!(stats.removed, 1);
    assert!(
        !back_of(&g, "Projects/Alpha.md")
            .iter()
            .any(|b| b.source_path == "Projects/Beta.md")
    );
}

#[test]
fn a_note_with_no_modification_time_is_rescanned_every_sweep() {
    let d = linked_vault();
    let (g, c) = (graph(), FixedClock::new(0));
    d.set_modified_ns(&join_rel(root(), "Home.md"), None)
        .unwrap();
    g.refresh(&*d, &c, root());
    let stats = g.refresh_now(&*d, &c, root());
    assert_eq!(stats.updated, 1, "no stamp never compares fresh");
    assert_eq!(stats.unchanged, 3);
}

#[test]
fn a_same_size_edit_inside_one_millisecond_is_still_seen() {
    let d = vault(&[
        ("Home.md", "[[Alpha]]\n"),
        ("Alpha.md", "a"),
        ("Bravo.md", "b"),
    ]);
    let home = join_rel(root(), "Home.md");
    d.set_modified_ns(&home, Some(5_000_000_100)).unwrap();
    let (g, c) = (graph(), FixedClock::new(0));
    g.refresh(&*d, &c, root());
    assert_eq!(g.backlinks("Alpha.md").total, 1);

    // Same size, and 400 ns later: the whole milliseconds do not move.
    put(&d, "Home.md", "[[Bravo]]\n");
    d.set_modified_ns(&home, Some(5_000_000_500)).unwrap();
    let stats = g.refresh_now(&*d, &c, root());
    assert_eq!(stats.updated, 1);
    assert_eq!(g.backlinks("Bravo.md").total, 1);
}

#[test]
fn a_snapshot_reads_paths_and_notes_from_one_sweep() {
    let d = linked_vault();
    let (g, c) = (graph(), FixedClock::new(0));
    g.refresh(&*d, &c, root());
    let (paths, notes) = g.with_snapshot(|paths, notes| (paths.to_vec(), notes.len()));
    assert_eq!(paths, g.paths());
    assert_eq!(notes, 4);
    assert!(paths.contains(&"assets/diagram.svg".to_string()));
}

#[test]
fn the_default_walk_keeps_excluded_files_and_a_caller_walk_can_drop_them() {
    let d = linked_vault();
    put(
        &d,
        ".obsidian/app.json",
        r#"{"userIgnoreFilters":["Projects/"]}"#,
    );
    let (g, c) = (graph(), FixedClock::new(0));
    g.refresh(&*d, &c, root());
    assert!(g.paths().contains(&"Projects/Alpha.md".to_string()));

    let hiding = graph().with_walk(WalkOptions::notes_and_attachments());
    hiding.refresh(&*d, &c, root());
    assert!(!hiding.paths().iter().any(|p| p.starts_with("Projects/")));
    // A change under a hidden folder is not the graph's.
    put(&d, "Projects/Gamma.md", "[[Home]]\n");
    hiding.apply_changes(&*d, root(), &["Projects/Gamma.md".to_string()]);
    assert!(!hiding.paths().contains(&"Projects/Gamma.md".to_string()));
    g.apply_changes(&*d, root(), &["Projects/Gamma.md".to_string()]);
    assert!(g.paths().contains(&"Projects/Gamma.md".to_string()));
}

#[test]
fn a_failed_walk_leaves_the_graph_as_it_was() {
    let d = linked_vault();
    let strict = WalkOptions {
        errors: Errors::Propagate,
        ..LinkGraph::default_walk()
    };
    let (g, c) = (graph().with_walk(strict), FixedClock::new(0));
    g.try_refresh(&*d, &c, root()).unwrap();
    assert_eq!(g.len(), 4);
    // The corpus folder is gone, so it cannot be listed.
    d.remove(root()).unwrap();
    let err = g.try_refresh_now(&*d, &c, root()).unwrap_err();
    assert!(
        matches!(err, WalkError::Io(ref e) if e.is_not_found()),
        "{err}"
    );
    assert_eq!(g.len(), 4, "the last good sweep stays");
    // A failed walk is reported as the graph stands, as a reused sweep is.
    let resolvable = g.with_index(|i| i.len());
    assert_eq!(
        g.refresh_now(&*d, &c, root()),
        GraphStats {
            unchanged: 4,
            resolvable,
            ..GraphStats::default()
        }
    );
    assert_eq!(g.backlinks("Projects/Alpha.md").total, 2);
    // A failed walk is not fresh: inside the TTL, the next one walks, and
    // fails, again.
    assert!(g.try_refresh(&*d, &c, root()).is_err());
}

fn walking(errors: Errors) -> LinkGraph {
    graph().with_walk(WalkOptions {
        errors,
        ..LinkGraph::default_walk()
    })
}

fn paths_of(errors: Vec<Arc<VfsError>>) -> Vec<PathBuf> {
    errors.iter().map(|e| e.path().to_path_buf()).collect()
}

#[test]
fn a_reporting_graph_keeps_going_past_a_note_it_cannot_read_and_names_it() {
    let d = linked_vault();
    let beta = join_rel(root(), "Projects/Beta.md");
    let locked = hooks::StatHook::unreadable(&*d, beta.clone());
    let c = FixedClock::new(0);

    let g = walking(Errors::Report);
    assert_eq!(g.refresh(&locked, &c, root()).added, 4);
    assert!(g.paths().contains(&"Projects/Beta.md".to_string()));
    assert!(g.outbound("Projects/Beta.md").is_empty(), "nothing read");
    assert_eq!(paths_of(g.unreadable()), vec![beta.clone()]);
    // Never fresh: the next sweep tries it again, and still reports it,
    // but a note that is still unreadable is unchanged: no rebuild.
    let rebuilds = g.rebuilds();
    let again = g.refresh_now(&locked, &c, root());
    assert_eq!((again.updated, again.unchanged), (0, 4));
    assert_eq!(g.rebuilds(), rebuilds);
    assert_eq!(paths_of(g.unreadable()), vec![beta.clone()]);
    // Readable again: read, and no longer reported.
    assert_eq!(g.refresh_now(&*d, &c, root()).updated, 1);
    assert!(g.unreadable().is_empty());
    assert!(!g.outbound("Projects/Beta.md").is_empty());

    // Skipped: the same graph, and nothing reported.
    let skip = walking(Errors::Skip);
    skip.refresh(&locked, &c, root());
    assert_eq!(skip.paths(), g.paths());
    assert!(skip.unreadable().is_empty());

    // Propagated: the sweep fails on it.
    let err = walking(Errors::Propagate)
        .try_refresh(&locked, &c, root())
        .unwrap_err();
    assert!(
        matches!(err, WalkError::Io(ref e) if e.path() == beta),
        "{err}"
    );
}

#[test]
fn a_file_it_can_neither_stat_nor_read_is_named_once() {
    let d = linked_vault();
    let beta = join_rel(root(), "Projects/Beta.md");
    let locked = hooks::StatHook::denied(&*d, beta.clone());
    let g = walking(Errors::Report);
    g.refresh(&locked, &FixedClock::new(0), root());
    assert_eq!(paths_of(g.unreadable()), vec![beta]);
}

#[test]
fn an_apply_that_cannot_read_under_propagate_makes_the_next_refresh_fail() {
    let d = linked_vault();
    let beta = join_rel(root(), "Projects/Beta.md");
    let locked = hooks::StatHook::unreadable(&*d, beta);
    let (g, c) = (walking(Errors::Propagate), FixedClock::new(0));
    g.set_watched();
    g.try_refresh(&*d, &c, root()).unwrap();
    g.apply_changes(&locked, root(), &["Projects/Beta.md".to_string()]);
    // Inside the TTL, yet the refresh walks and fails.
    assert!(g.try_refresh(&locked, &c, root()).is_err());

    // The same for a note it cannot even stat, which the apply leaves out.
    let d = linked_vault();
    let denied = hooks::StatHook::denied(&*d, join_rel(root(), "Projects/Beta.md"));
    let g = walking(Errors::Propagate);
    g.set_watched();
    g.try_refresh(&*d, &c, root()).unwrap();
    g.apply_changes(&denied, root(), &["Projects/Beta.md".to_string()]);
    assert!(g.try_refresh(&denied, &c, root()).is_err());
}

#[test]
fn an_apply_keeps_reporting_a_file_it_still_cannot_stat() {
    let d = linked_vault();
    let svg = join_rel(root(), "assets/diagram.svg");
    let locked = hooks::StatHook::denied(&*d, svg.clone());
    let (g, c) = (walking(Errors::Report), FixedClock::new(0));
    g.refresh(&locked, &c, root());
    assert_eq!(paths_of(g.unreadable()), vec![svg.clone()]);
    let changed = ["assets/diagram.svg".to_string()];
    g.apply_changes(&locked, root(), &changed);
    assert_eq!(paths_of(g.unreadable()), vec![svg], "as the sweep has it");
    g.apply_changes(&*d, root(), &changed);
    assert!(g.unreadable().is_empty());
}

#[test]
fn a_clean_sweep_does_not_put_back_what_an_apply_cleared() {
    let d = linked_vault();
    let beta = join_rel(root(), "Projects/Beta.md");
    let locked = hooks::StatHook::unreadable(&*d, beta);
    let (g, c) = (Rc::new(walking(Errors::Report)), FixedClock::new(0));
    g.refresh(&locked, &c, root());
    assert_eq!(g.unreadable().len(), 1);
    // The next sweep is clean (Beta is still unreadable, so unchanged), and
    // an apply that reads Beta lands in the middle of it.
    let (g2, d2) = (Rc::clone(&g), Rc::clone(&d));
    mid_sweep(move || g2.apply_changes(&*d2, root(), &["Projects/Beta.md".to_string()]));
    g.refresh_now(&locked, &c, root());
    assert!(g.unreadable().is_empty(), "the apply's report stands");
    assert!(!g.outbound("Projects/Beta.md").is_empty());
}

#[test]
fn a_reporting_graph_names_a_folder_it_cannot_list() {
    let d = linked_vault();
    let projects = join_rel(root(), "Projects");
    let locked = hooks::StatHook::unreadable(&*d, projects.clone());
    let g = walking(Errors::Report);
    g.refresh(&locked, &FixedClock::new(0), root());
    assert!(!g.paths().iter().any(|p| p.starts_with("Projects/")));
    assert_eq!(paths_of(g.unreadable()), vec![projects.clone()]);
    // An apply that names the folder leaves its entry to the next sweep.
    g.apply_changes(&locked, root(), &["Projects".to_string()]);
    assert_eq!(paths_of(g.unreadable()), vec![projects]);
}

#[test]
fn a_file_gone_between_its_listing_and_its_stat_is_not_unreadable() {
    let d = linked_vault();
    let beta = join_rel(root(), "Projects/Beta.md");
    let gone = hooks::StatHook::vanished(&*d, beta);
    let g = walking(Errors::Report);
    g.refresh(&gone, &FixedClock::new(0), root());
    assert!(g.unreadable().is_empty());
}

#[test]
fn an_apply_updates_what_the_graph_could_not_read() {
    let d = linked_vault();
    let beta = join_rel(root(), "Projects/Beta.md");
    let locked = hooks::StatHook::unreadable(&*d, beta.clone());
    let (g, c) = (walking(Errors::Report), FixedClock::new(0));
    g.refresh(&*d, &c, root());
    assert!(g.unreadable().is_empty());
    let changed = ["Projects/Beta.md".to_string()];
    g.apply_changes(&locked, root(), &changed);
    assert_eq!(paths_of(g.unreadable()), [beta]);
    assert!(g.outbound("Projects/Beta.md").is_empty());
    g.apply_changes(&*d, root(), &changed);
    assert!(g.unreadable().is_empty());
    assert!(!g.outbound("Projects/Beta.md").is_empty());
}

#[test]
fn a_list_only_note_resolves_but_is_never_read() {
    let d = linked_vault();
    let config = join_rel(root(), "_system/config.md");
    let locked = hooks::StatHook::unreadable(&*d, config);
    let g = walking(Errors::Report).with_list_only(|rel| rel.starts_with("_system/"));
    assert_eq!(g.refresh(&locked, &FixedClock::new(0), root()).added, 3);
    assert!(g.paths().contains(&"_system/config.md".to_string()));
    assert!(g.unreadable().is_empty(), "never read, so never unreadable");
    assert_eq!(g.len(), 3);
    assert_eq!(
        g.resolve("config", "Home.md").as_deref(),
        Some("_system/config.md")
    );
    assert!(g.outbound("_system/config.md").is_empty());
    assert!(
        !back_of(&g, "Home.md")
            .iter()
            .any(|b| b.source_path == "_system/config.md")
    );
    // An apply lists it without reading it, too.
    put(&d, "_system/config.md", "[[Projects/Alpha]]\n");
    g.apply_changes(&*d, root(), &["_system/config.md".to_string()]);
    assert_eq!(g.len(), 3);
    assert!(g.paths().contains(&"_system/config.md".to_string()));
    assert_eq!(g.backlinks("Projects/Alpha.md").total, 2);
}

// ── Coalescing ─────────────────────────────────────────────────────────

#[test]
fn a_burst_of_refreshes_inside_the_ttl_shares_one_sweep() {
    let d = linked_vault();
    let (g, c) = (graph(), FixedClock::new(1_000));
    let first = g.refresh(&*d, &c, root());
    assert_eq!(first.added, 4);

    rm(&d, "Projects/Beta.md");
    c.advance(REFRESH_TTL_MS - 1);
    let coalesced = g.refresh(&*d, &c, root());
    assert_eq!(coalesced.removed, 0, "the sweep was skipped, not run");
    assert_eq!(
        coalesced.unchanged, 4,
        "a coalesced sweep reports the cache"
    );
    assert_eq!(coalesced.resolvable, first.resolvable);
    assert_eq!(g.len(), 4);

    assert_eq!(g.refresh_now(&*d, &c, root()).removed, 1);
    assert_eq!(g.len(), 3);
}

#[test]
fn the_ttl_runs_out_on_the_callers_clock() {
    let d = linked_vault();
    let (g, c) = (graph(), FixedClock::new(1_000));
    g.refresh(&*d, &c, root());
    rm(&d, "Projects/Beta.md");
    c.advance(REFRESH_TTL_MS);
    assert_eq!(g.refresh(&*d, &c, root()).removed, 1, "the TTL ran out");
}

#[test]
fn a_clock_that_goes_backwards_never_counts_as_fresh() {
    let d = linked_vault();
    let (g, c) = (graph(), FixedClock::new(1_000));
    g.refresh(&*d, &c, root());
    rm(&d, "Projects/Beta.md");
    c.set(10);
    assert_eq!(g.refresh(&*d, &c, root()).removed, 1);
}

#[test]
fn apply_changes_rescans_named_notes_without_a_sweep() {
    let d = linked_vault();
    let (g, c) = (graph(), FixedClock::new(0));
    g.refresh_now(&*d, &c, root());
    assert_eq!(g.rebuilds(), 1);
    assert_eq!(back_of(&g, "Projects/Alpha.md").len(), 2);

    put(&d, "Home.md", "# Home\n\nNo links out any more.\n");
    g.apply_changes(&*d, root(), &["Home.md".to_string()]);
    let back = back_of(&g, "Projects/Alpha.md");
    assert_eq!(back.len(), 1, "Home's edge is gone");
    assert_eq!(back[0].source_path, "Projects/Beta.md");
    assert_eq!(g.rebuilds(), 1, "content change: no index rebuild");
    assert_eq!(g.applied(), 1);
}

#[test]
fn apply_changes_handles_creates_and_deletes_and_the_resolvable_set() {
    let d = linked_vault();
    let (g, c) = (graph(), FixedClock::new(0));
    g.refresh_now(&*d, &c, root());

    put(&d, "Fresh.md", "See [[Projects/Alpha]].\n");
    g.apply_changes(&*d, root(), &["Fresh.md".to_string()]);
    assert!(
        back_of(&g, "Projects/Alpha.md")
            .iter()
            .any(|b| b.source_path == "Fresh.md")
    );
    assert!(g.with_index(|i| i.resolve("Fresh").is_some()));

    rm(&d, "Fresh.md");
    g.apply_changes(&*d, root(), &["Fresh.md".to_string()]);
    assert!(
        !back_of(&g, "Projects/Alpha.md")
            .iter()
            .any(|b| b.source_path == "Fresh.md")
    );

    let stats = g.refresh(&*d, &c, root());
    assert_eq!(
        stats.added + stats.updated + stats.removed,
        0,
        "still fresh"
    );
}

#[test]
fn apply_changes_removes_a_deleted_path_even_when_walk_order_disagrees_with_collation() {
    // The walk yields byte order; the path list is kept in collation order,
    // which `apply_changes` binary-searches. The two disagree here.
    let d = linked_vault();
    let (g, c) = (graph(), FixedClock::new(0));
    g.refresh_now(&*d, &c, root());
    assert!(
        back_of(&g, "assets/diagram.svg")
            .iter()
            .any(|b| b.source_path == "Projects/Beta.md")
    );

    rm(&d, "assets/diagram.svg");
    g.apply_changes(&*d, root(), &["assets/diagram.svg".to_string()]);
    assert!(
        !back_of(&g, "assets/diagram.svg")
            .iter()
            .any(|b| b.source_path == "Projects/Beta.md")
    );
}

#[test]
fn a_watched_graph_stays_fresh_past_the_short_ttl_until_marked_stale() {
    let d = linked_vault();
    let (g, c) = (graph(), FixedClock::new(0));
    g.set_watched();
    g.refresh(&*d, &c, root());

    c.advance(600);
    put(&d, "New.md", "See [[Home]].\n");
    assert_eq!(
        g.refresh(&*d, &c, root()).added,
        0,
        "past 500ms, still reused"
    );

    g.mark_stale();
    assert_eq!(g.refresh(&*d, &c, root()).added, 1, "mark_stale walks");
}

#[test]
fn mark_stale_during_a_clean_sweep_survives_its_stamp() {
    let d = linked_vault();
    let (g, c) = (Arc::new(graph()), FixedClock::new(0));
    g.set_watched();
    g.refresh(&*d, &c, root());

    let (gg, dd) = (Arc::clone(&g), Rc::clone(&d));
    mid_sweep(move || {
        put(&dd, "New.md", "See [[Home]].\n");
        gg.mark_stale();
    });
    g.refresh_now(&*d, &c, root());

    assert_eq!(g.refresh(&*d, &c, root()).added, 1, "the mark made it walk");
}

#[test]
fn mark_stale_during_a_rebuilding_sweep_survives_its_swap() {
    let d = linked_vault();
    let (g, c) = (Arc::new(graph()), FixedClock::new(0));
    g.set_watched();
    g.refresh(&*d, &c, root());
    put(&d, "Other.md", "See [[Home]].\n");

    let (gg, dd) = (Arc::clone(&g), Rc::clone(&d));
    mid_sweep(move || {
        put(&dd, "New.md", "See [[Home]].\n");
        gg.mark_stale();
    });
    assert_eq!(g.refresh_now(&*d, &c, root()).added, 1, "the sweep rebuilt");

    assert_eq!(g.refresh(&*d, &c, root()).added, 1, "the mark made it walk");
}

#[test]
fn apply_changes_during_a_cold_sweep_is_not_lost() {
    let d = vault(&[
        ("Home.md", "See [[Bravo]].\n"),
        ("Bravo.md", "# Bravo\n"),
        ("Charlie.md", "# Charlie\n"),
    ]);
    let (g, c) = (Arc::new(graph()), FixedClock::new(0));
    g.set_watched();

    let (gg, dd) = (Arc::clone(&g), Rc::clone(&d));
    mid_sweep(move || {
        put(&dd, "Home.md", "Now see [[Charlie]] instead.\n");
        gg.apply_changes(&*dd, root(), &["Home.md".to_string()]);
    });
    g.refresh(&*d, &c, root());

    g.refresh(&*d, &c, root());
    assert_eq!(g.backlink_sources("Charlie.md"), vec!["Home.md"]);
    assert!(g.backlink_sources("Bravo.md").is_empty());
}

#[test]
fn an_apply_during_a_sweep_is_not_overwritten_by_the_swap() {
    let d = vault(&[
        ("Home.md", "See [[A]].\n"),
        ("A.md", "# A\n"),
        ("B.md", "# B\n"),
    ]);
    let (g, c) = (Arc::new(graph()), FixedClock::new(0));
    g.refresh_now(&*d, &c, root());

    put(&d, "Home.md", "See [[A]] still.\n");
    let (gg, dd) = (Arc::clone(&g), Rc::clone(&d));
    mid_sweep(move || {
        put(&dd, "Home.md", "Now [[B]].\n");
        gg.apply_changes(&*dd, root(), &["Home.md".to_string()]);
    });
    g.refresh_now(&*d, &c, root());
    assert_eq!(g.backlink_sources("B.md"), vec!["Home.md"]);
    assert!(g.backlink_sources("A.md").is_empty());
}

#[test]
fn an_apply_installs_what_it_read() {
    let d = vault(&[
        ("A.md", "# A\n"),
        ("B.md", "# B\n"),
        ("Home.md", "# Home\n"),
    ]);
    let (g, c) = (graph(), FixedClock::new(0));
    g.refresh_now(&*d, &c, root());
    put(&d, "Home.md", "See [[A]].\n");

    let dd = Rc::clone(&d);
    mid_apply(move || put(&dd, "Home.md", "Now see [[B]] instead.\n"));
    g.apply_changes(&*d, root(), &["Home.md".to_string()]);
    assert_eq!(g.backlink_sources("A.md"), vec!["Home.md"]);
    // The file moved after the read; the next refresh sees it.
    g.refresh_now(&*d, &c, root());
    assert_eq!(g.backlink_sources("B.md"), vec!["Home.md"]);
}

#[test]
fn a_path_spelled_otherwise_than_on_disk_makes_the_next_refresh_walk() {
    let d = vault(&[("Alpha.md", "# Alpha\n"), ("Home.md", "See [[Alpha]]\n")]);
    let (g, c) = (graph(), FixedClock::new(0));
    g.refresh_now(&*d, &c, root());
    put(&d, "Home.md", "No links.\n");
    // A watcher reports the edit by a spelling the file system answers for
    // but the folder does not list (another case, or another Unicode form).
    let vfs = hooks::StatHook::aliased(
        &*d,
        join_rel(root(), "home.md"),
        join_rel(root(), "Home.md"),
    );
    g.apply_changes(&vfs, root(), &["home.md".to_string()]);
    assert_eq!(
        g.paths(),
        ["Alpha.md", "Home.md"],
        "not keyed by that spelling"
    );
    // Inside the TTL, yet the refresh walks and reads the edit.
    assert_eq!(g.refresh(&vfs, &c, root()).updated, 1);
    assert!(g.backlink_sources("Alpha.md").is_empty());
}

/// Whether `refresh` walks: a mid-sweep hook only runs in a walk.
fn walks(g: &LinkGraph, vfs: &dyn Vfs, c: &FixedClock) -> bool {
    let walked = Rc::new(std::cell::Cell::new(false));
    let flag = Rc::clone(&walked);
    mid_sweep(move || flag.set(true));
    g.refresh(vfs, c, root());
    // A reused sweep leaves the hook unrun; replace it with one that does
    // nothing.
    mid_sweep(|| {});
    walked.get()
}

#[test]
fn a_case_only_rename_on_a_case_insensitive_disk_walks_once() {
    let d = vault(&[("Alpha.md", "# Alpha\n"), ("Home.md", "See [[Alpha]]\n")]);
    let (g, c) = (graph(), FixedClock::new(0));
    g.refresh_now(&*d, &c, root());
    d.rename(&join_rel(root(), "Home.md"), &join_rel(root(), "home.md"))
        .unwrap();
    // The old spelling still stats: it is dropped, and the next refresh
    // walks, in case the watcher never reports the new one.
    let vfs = hooks::StatHook::aliased(
        &*d,
        join_rel(root(), "Home.md"),
        join_rel(root(), "home.md"),
    );
    g.apply_changes(&vfs, root(), &["Home.md".to_string()]);
    assert_eq!(g.paths(), ["Alpha.md"]);
    assert!(walks(&g, &vfs, &c));
    assert_eq!(g.paths(), ["Alpha.md", "home.md"]);
    assert!(!walks(&g, &vfs, &c), "once");
}

#[test]
fn a_change_to_the_obsidian_folder_makes_the_next_refresh_walk() {
    let d = linked_vault();
    let g = graph().with_walk(WalkOptions {
        hide: Hide::Vault,
        ..LinkGraph::default_walk()
    });
    let c = FixedClock::new(0);
    g.refresh(&*d, &c, root());
    assert!(!walks(&g, &*d, &c));
    g.apply_changes(&*d, root(), &[".obsidian".to_string()]);
    assert!(walks(&g, &*d, &c));
}

#[test]
fn apply_changes_drops_the_old_spelling_of_a_case_only_rename() {
    let d = vault(&[("Alpha.md", "# Alpha\n"), ("Home.md", "See [[Alpha]] #t\n")]);
    let (g, c) = (graph(), FixedClock::new(0));
    g.refresh_now(&*d, &c, root());

    d.rename(&join_rel(root(), "Home.md"), &join_rel(root(), "home.md"))
        .unwrap();
    g.apply_changes(&*d, root(), &["Home.md".to_string(), "home.md".to_string()]);

    assert_eq!(g.paths(), vec!["Alpha.md", "home.md"]);
    assert_eq!(g.backlink_sources("Alpha.md"), vec!["home.md"]);
}

#[test]
fn apply_changes_on_a_cold_graph_or_another_vault_does_nothing() {
    let d = linked_vault();
    let (g, c) = (graph(), FixedClock::new(0));
    g.apply_changes(&*d, root(), &["Home.md".to_string()]);
    assert!(g.is_empty());
    g.refresh(&*d, &c, root());
    g.apply_changes(&*d, Path::new("/elsewhere"), &["Home.md".to_string()]);
    assert_eq!(g.applied(), 0);
    g.apply_changes(&*d, root(), &[".obsidian/app.json".to_string()]);
    assert_eq!(g.applied(), 0, "a dot path is never admitted");
}

#[test]
fn a_vault_switch_always_bypasses_the_ttl_and_clears() {
    let a = linked_vault();
    let b = MemVfs::new();
    b.insert("/w/Only.md", "# Only\n").unwrap();
    let (g, c) = (graph(), FixedClock::new(0));
    g.refresh(&*a, &c, root());
    assert_eq!(g.len(), 4);

    let stats = g.refresh(&b, &c, Path::new("/w"));
    assert_eq!(stats.added, 1, "the switch swept rather than coalescing");
    assert_eq!(g.len(), 1);
    assert!(back_of(&g, "Projects/Alpha.md").is_empty());

    g.refresh(&*a, &c, root());
    assert_eq!(back_of(&g, "Projects/Alpha.md").len(), 2);
}

#[test]
fn a_switch_to_an_empty_corpus_counts_as_a_rebuild() {
    let a = linked_vault();
    a.create_dir_all(Path::new("/w")).unwrap();
    let (g, c) = (graph(), FixedClock::new(0));
    g.refresh(&*a, &c, root());
    assert_eq!(g.rebuilds(), 1);
    // The graph went from four notes to none: a reader keyed on the count
    // must see it.
    g.refresh(&*a, &c, Path::new("/w"));
    assert!(g.is_empty());
    assert_eq!(g.rebuilds(), 2);
}

#[test]
fn a_batch_cannot_undo_a_later_batch_with_what_it_read_first() {
    // An atomic save: the note is gone for a moment, then back.
    let d = linked_vault();
    let (g, c) = (graph(), FixedClock::new(0));
    g.refresh(&*d, &c, root());
    rm(&d, "Projects/Alpha.md");
    let x = vec!["Projects/Alpha.md".to_string()];
    let later_ran = std::cell::Cell::new(false);
    // Batch A lists the note's folder while the note is gone. Before A
    // acts on that, the note comes back and batch B applies it, unless A
    // already holds the apply lock, in which case B must wait for A.
    let vfs = super::hooks::StatHook::after(&*d, join_rel(root(), &x[0]), || {
        put(&d, "Projects/Alpha.md", "# Alpha\n");
        if let Ok(free) = g.apply_lock.try_lock() {
            drop(free);
            g.apply_changes(&*d, root(), &x);
            later_ran.set(true);
        }
    });
    g.apply_changes(&vfs, root(), &x);
    if !later_ran.get() {
        g.apply_changes(&*d, root(), &x);
    }
    assert!(g.paths().contains(&x[0]), "the note is back");
    assert_eq!(g.backlinks("Projects/Alpha.md").total, 2);
}

// ── Cost, pinned ───────────────────────────────────────────────────────

#[test]
fn an_unchanged_note_is_reused_by_pointer_and_never_deep_copied() {
    let d = linked_vault();
    let (g, c) = (graph(), FixedClock::new(0));
    g.refresh_now(&*d, &c, root());
    let ptrs = |g: &LinkGraph| -> Vec<(String, *const NoteFacts)> {
        g.with_notes(|n| n.iter().map(|(p, f)| (p.clone(), Arc::as_ptr(f))).collect())
    };
    let before = ptrs(&g);
    assert_eq!(before.len(), 4);
    assert_eq!(g.refresh_now(&*d, &c, root()).unchanged, 4);
    assert_eq!(before, ptrs(&g));
}

#[test]
fn a_clean_sweep_walks_but_does_not_rebuild_the_index_or_the_edges() {
    let d = linked_vault();
    let (g, c) = (graph(), FixedClock::new(0));
    g.refresh_now(&*d, &c, root());
    assert_eq!(g.rebuilds(), 1);
    for _ in 0..5 {
        let stats = g.refresh_now(&*d, &c, root());
        assert_eq!(stats.unchanged, 4);
        assert!(stats.resolvable > 0);
    }
    assert_eq!(g.rebuilds(), 1, "five clean sweeps rebuilt nothing");

    put(&d, "New.md", "See [[Home]].\n");
    g.refresh_now(&*d, &c, root());
    assert_eq!(g.rebuilds(), 2);
    assert_eq!(back_of(&g, "Home.md").len(), 3);
}

#[test]
fn an_attachment_appearing_rebuilds_even_though_no_note_changed() {
    let d = linked_vault();
    let (g, c) = (graph(), FixedClock::new(0));
    g.refresh_now(&*d, &c, root());
    put(&d, "assets/new.png", "png");
    assert_eq!(g.refresh_now(&*d, &c, root()).unchanged, 4);
    assert_eq!(g.rebuilds(), 2, "the resolvable set moved, so it rebuilt");
}

#[test]
fn reads_answer_from_the_one_sweeps_inverted_map() {
    let d = linked_vault();
    let (g, c) = (graph(), FixedClock::new(0));
    g.refresh_now(&*d, &c, root());
    rm(&d, "Projects/Alpha.md");
    for _ in 0..25 {
        assert_eq!(back_of(&g, "Projects/Alpha.md").len(), 2);
    }
}

#[test]
fn a_hub_notes_backlinks_are_capped_and_the_cap_is_reported() {
    let over = MAX_BACKLINK_SOURCES + 17;
    let d = vault(&[("Hub.md", "# Hub\n")]);
    for i in 0..over {
        put(&d, &format!("Daily/{i:04}.md"), "See [[Hub]].\n");
    }
    let (g, c) = (graph(), FixedClock::new(0));
    g.refresh_now(&*d, &c, root());

    let page = g.backlinks("Hub.md");
    assert_eq!(page.backlinks.len(), MAX_BACKLINK_SOURCES);
    assert_eq!(page.total, over);
    assert!(page.truncated());
    assert_eq!(page.backlinks[0].source_path, "Daily/0000.md");

    let ordinary = g.backlinks("Daily/0000.md");
    assert!(!ordinary.truncated());
    assert_eq!(ordinary.total, 0);
}

// ── Backlinks ──────────────────────────────────────────────────────────

#[test]
fn backlinks_find_bare_pathed_aliased_heading_and_block_anchored_links() {
    let d = linked_vault();
    let g = graph();
    g.refresh(&*d, &FixedClock::new(0), root());
    let back = back_of(&g, "Projects/Alpha.md");
    let sources: Vec<&str> = back.iter().map(|b| b.source_path.as_str()).collect();
    assert_eq!(sources, vec!["Home.md", "Projects/Beta.md"]);
    assert_eq!(back[0].count, 2);
    assert_eq!(back[1].count, 2);
}

#[test]
fn an_embed_is_a_backlink_and_so_is_a_system_note() {
    let d = linked_vault();
    let g = graph();
    g.refresh(&*d, &FixedClock::new(0), root());
    let back = back_of(&g, "Home.md");
    let beta = back
        .iter()
        .find(|b| b.source_path == "Projects/Beta.md")
        .expect("the embed");
    assert_eq!(beta.contexts[0].kind, EdgeKind::Embed);
    assert!(back.iter().any(|b| b.source_path == "_system/config.md"));
}

#[test]
fn an_unresolved_link_produces_no_backlink_anywhere() {
    let d = linked_vault();
    let g = graph();
    g.refresh(&*d, &FixedClock::new(0), root());
    assert!(back_of(&g, "Missing Note").is_empty());
    assert!(back_of(&g, "Missing Note.md").is_empty());
}

#[test]
fn a_bare_name_resolves_to_the_same_backlinks_as_the_full_path() {
    let d = linked_vault();
    let g = graph();
    g.refresh(&*d, &FixedClock::new(0), root());
    assert_eq!(back_of(&g, "Projects/Alpha.md"), back_of(&g, "Alpha"));
}

#[test]
fn a_self_link_is_not_a_backlink() {
    let d = vault(&[
        ("Loop.md", "I link to [[Loop]] and [[Other]].\n"),
        ("Other.md", "x"),
    ]);
    let g = graph();
    g.refresh(&*d, &FixedClock::new(0), root());
    assert!(back_of(&g, "Loop.md").is_empty());
    assert_eq!(back_of(&g, "Other.md").len(), 1);
}

#[test]
fn contexts_carry_the_line_number_and_fill_with_the_source_line() {
    let d = linked_vault();
    let g = graph();
    g.refresh(&*d, &FixedClock::new(0), root());
    let mut back = back_of(&g, "Projects/Alpha.md");
    g.fill_contexts(&*d, root(), &mut back);
    let home = &back[0];
    assert_eq!(home.contexts.len(), 2);
    assert!(home.contexts[0].text.contains("[[Projects/Alpha]]"));
    // Body-relative: Home.md's body starts at `# Home`.
    assert_eq!(home.contexts[0].line, 3);
    let body = NoteBody::read(&*d, root(), "Home.md").unwrap();
    assert_eq!(body.offset, 3, "three frontmatter lines precede the body");
}

#[test]
fn contexts_fill_from_the_corpus_the_page_came_from() {
    // The same note in two corpora, with different text on the link's line.
    let d = vault(&[("Home.md", "See [[Alpha]] here.\n"), ("Alpha.md", "a")]);
    d.insert("/w/Home.md", "Other text.\n").unwrap();
    d.insert("/w/Alpha.md", "a").unwrap();
    let (g, c) = (graph(), FixedClock::new(0));
    g.refresh(&*d, &c, root());
    let mut back = back_of(&g, "Alpha.md");
    // Another caller moves the shared graph to the other corpus.
    g.refresh(&*d, &c, Path::new("/w"));
    g.fill_contexts(&*d, root(), &mut back);
    assert_eq!(back[0].contexts[0].text, "See [[Alpha]] here.");
}

#[test]
fn inbound_exact_matches_paths_not_targets() {
    let d = linked_vault();
    let g = graph();
    g.refresh(&*d, &FixedClock::new(0), root());
    let got = g.inbound_exact(&["Projects/Alpha.md".to_string(), "Alpha".to_string()]);
    assert_eq!(got[0].len(), 2);
    assert!(got[1].is_empty(), "a name is not a path");
}

#[test]
fn a_link_inside_a_code_fence_is_not_an_edge() {
    let d = vault(&[
        ("Src.md", "real [[Target]]\n\n```\nfake [[Target]]\n```\n"),
        ("Target.md", "x"),
    ]);
    let g = graph();
    g.refresh(&*d, &FixedClock::new(0), root());
    assert_eq!(back_of(&g, "Target.md")[0].count, 1);
}

// ── Edge kinds and unresolved edges ────────────────────────────────────

#[test]
fn inbound_types_each_edge_and_can_include_frontmatter() {
    let d = linked_vault();
    let g = graph();
    g.refresh(&*d, &FixedClock::new(0), root());

    let body = g.inbound("Home.md", &EdgeKind::BODY);
    assert!(body.iter().all(|e| e.kind != EdgeKind::Frontmatter));
    assert!(body.iter().any(|e| e.source == "Projects/Beta.md"
        && e.kind == EdgeKind::Embed
        && e.target == "Home"));

    let all = g.inbound("Home.md", &EdgeKind::ALL);
    let fm: Vec<&Edge> = all
        .iter()
        .filter(|e| e.kind == EdgeKind::Frontmatter)
        .collect();
    assert_eq!(fm.len(), 1, "{all:?}");
    assert_eq!(fm[0].source, "Projects/Beta.md");
    assert_eq!(fm[0].field.as_deref(), Some("cover"));
    assert_eq!(fm[0].resolved.as_deref(), Some("Home.md"));
    // `backlinks` keeps its meaning: body links only.
    let beta = back_of(&g, "Home.md")
        .into_iter()
        .find(|b| b.source_path == "Projects/Beta.md")
        .unwrap();
    assert_eq!(beta.count, 1);
}

#[test]
fn unresolved_edges_are_kept() {
    let d = linked_vault();
    let (g, c) = (graph(), FixedClock::new(0));
    g.refresh(&*d, &c, root());
    let unresolved = g.unresolved();
    assert_eq!(unresolved.len(), 1, "{unresolved:?}");
    assert_eq!(unresolved[0].source, "Home.md");
    assert_eq!(unresolved[0].target, "Missing Note");
    assert_eq!(unresolved[0].resolved, None);
    assert_eq!(unresolved[0].kind, EdgeKind::Link);

    put(&d, "Missing Note.md", "x");
    g.apply_changes(&*d, root(), &["Missing Note.md".to_string()]);
    assert!(g.unresolved().is_empty(), "creating the note resolves it");
}

#[test]
fn outbound_lists_a_notes_edges_resolved_from_it() {
    let d = linked_vault();
    let g = graph();
    g.refresh(&*d, &FixedClock::new(0), root());
    let out = g.outbound("Projects/Beta.md");
    let kinds: Vec<EdgeKind> = out.iter().map(|e| e.kind).collect();
    assert_eq!(
        kinds,
        vec![
            EdgeKind::Embed,
            EdgeKind::Embed,
            EdgeKind::Link,
            EdgeKind::Link,
            EdgeKind::Frontmatter
        ],
        "{out:?}"
    );
    assert_eq!(out[1].resolved.as_deref(), Some("assets/diagram.svg"));
    assert!(g.outbound("Nope.md").is_empty());
}

#[test]
fn resolve_strict_refuses_an_ambiguous_name() {
    let d = vault(&[("a/Note.md", "x"), ("b/Note.md", "x"), ("Home.md", "x")]);
    let g = graph();
    g.refresh(&*d, &FixedClock::new(0), root());
    assert!(g.resolve("Note", "Home.md").is_some(), "lenient picks one");
    assert!(matches!(
        g.resolve_strict("Note", "Home.md"),
        Err(ResolveError::Ambiguous(c)) if c.len() == 2
    ));
    assert_eq!(g.resolve_strict("a/Note", "Home.md").unwrap(), "a/Note.md");
    assert_eq!(
        g.resolve_strict("Gone", "Home.md"),
        Err(ResolveError::NotFound)
    );
}

#[test]
fn excluded_files_stay_in_the_graph() {
    let d = linked_vault();
    put(
        &d,
        ".obsidian/app.json",
        r#"{"userIgnoreFilters":["Projects/"]}"#,
    );
    let g = graph();
    g.refresh(&*d, &FixedClock::new(0), root());
    assert_eq!(back_of(&g, "Projects/Alpha.md").len(), 2);
}

// ── Inline tags ────────────────────────────────────────────────────────

#[test]
fn inline_tags_are_cached_per_note_deduped_in_encounter_order() {
    let d = vault(&[("N.md", "#a #b #a again #b\n")]);
    let g = graph();
    g.refresh(&*d, &FixedClock::new(0), root());
    assert_eq!(g.inline_tags_by_note(0)["N.md"], vec!["a", "b"]);
}

#[test]
fn nested_tags_keep_their_slashes() {
    let d = linked_vault();
    put(&d, "N.md", "#area/sub\n");
    let g = graph();
    g.refresh(&*d, &FixedClock::new(0), root());
    let by_note = g.inline_tags_by_note(0);
    assert_eq!(by_note["Home.md"], vec!["home"]);
    assert_eq!(by_note["Projects/Alpha.md"], vec!["inline-tag"]);
    assert_eq!(by_note["N.md"], vec!["area/sub"]);
}

#[test]
fn one_sweep_holds_every_dialect_slot_and_no_lexer_finds_none() {
    let d = vault(&[("N.md", "#draft\n\n```\n#code\n```\n")]);
    let g = graph();
    g.refresh(&*d, &FixedClock::new(0), root());
    assert_eq!(g.inline_tags_by_note(0)["N.md"], vec!["draft"]);
    assert_eq!(g.inline_tags_by_note(1)["N.md"], vec!["DRAFT"]);
    assert!(g.inline_tags_by_note(7)["N.md"].is_empty(), "no such slot");

    let plain = LinkGraph::new();
    plain.refresh(&*d, &FixedClock::new(0), root());
    assert!(plain.inline_tags_by_note(0)["N.md"].is_empty());
}

#[test]
fn the_graph_is_send_and_sync() {
    fn assert_send_sync<T: Send + Sync>() {}
    assert_send_sync::<LinkGraph>();
}

// ── Over the real file system, across threads ──────────────────────────

#[cfg(feature = "native")]
mod native {
    use std::sync::mpsc;
    use std::time::Duration;

    use vfs_seam::{NativeVfs, SystemClock};

    use super::*;

    fn tempvault(files: &[(&str, &str)]) -> tempfile::TempDir {
        let d = tempfile::tempdir().unwrap();
        for (rel, body) in files {
            write(d.path(), rel, body);
        }
        d
    }

    fn write(dir: &Path, rel: &str, content: &str) {
        let p = dir.join(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, content).unwrap();
    }

    fn native_linked() -> tempfile::TempDir {
        tempvault(&[
            (
                "Home.md",
                "See [[Projects/Alpha]] and [[Projects/Alpha|alpha]].\n",
            ),
            ("Projects/Alpha.md", "# Alpha\n"),
            ("Projects/Beta.md", "[[Alpha#Goals]] and [[Alpha#^blk]]\n"),
            ("_system/config.md", "[[Home]]\n"),
        ])
    }

    #[test]
    fn overlapping_apply_batches_install_the_later_scan() {
        let d = tempvault(&[
            ("A.md", "# A\n"),
            ("B.md", "# B\n"),
            ("Home.md", "# Home\n"),
        ]);
        let g = Arc::new(LinkGraph::new());
        g.refresh_now(&NativeVfs, &SystemClock, d.path());
        write(d.path(), "Home.md", "See [[A]].\n");

        let (gg, root) = (Arc::clone(&g), d.path().to_path_buf());
        let second = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&second);
        mid_apply(move || {
            let (tx, rx) = mpsc::channel();
            let h = std::thread::spawn(move || {
                write(&root, "Home.md", "Now see [[B]] instead.\n");
                gg.apply_changes(&NativeVfs, &root, &["Home.md".to_string()]);
                let _ = tx.send(());
            });
            // Batch 2 waits for batch 1's lock, so nothing arrives here.
            let _ = rx.recv_timeout(Duration::from_millis(500));
            *slot.lock().unwrap() = Some(h);
        });
        g.apply_changes(&NativeVfs, d.path(), &["Home.md".to_string()]);
        second.lock().unwrap().take().unwrap().join().unwrap();

        assert_eq!(g.backlink_sources("B.md"), vec!["Home.md"]);
        assert!(g.backlink_sources("A.md").is_empty());
    }

    fn hammer(refresh_now: bool) {
        let d = native_linked();
        let vault = d.path().to_path_buf();
        let graph = Arc::new(LinkGraph::new());
        graph.refresh_now(&NativeVfs, &SystemClock, &vault);

        let (tx, rx) = mpsc::channel();
        let handles: Vec<_> = (0..8)
            .map(|i| {
                let graph = Arc::clone(&graph);
                let vault = vault.clone();
                let tx = tx.clone();
                std::thread::spawn(move || {
                    for _ in 0..20 {
                        match i % 4 {
                            0 if refresh_now => {
                                graph.refresh_now(&NativeVfs, &SystemClock, &vault);
                            }
                            0 => {
                                graph.refresh(&NativeVfs, &SystemClock, &vault);
                            }
                            1 => {
                                graph.backlinks("Projects/Alpha.md");
                            }
                            2 => {
                                graph.with_index(|idx| idx.resolve("Home").is_some());
                            }
                            _ => {
                                graph.inline_tags_by_note(0);
                            }
                        }
                    }
                    let _ = tx.send(());
                })
            })
            .collect();
        drop(tx);
        for n in 0..handles.len() {
            rx.recv_timeout(Duration::from_secs(30))
                .unwrap_or_else(|_| panic!("worker {n} never finished: the graph deadlocked"));
        }
        for h in handles {
            h.join().unwrap();
        }
        assert_eq!(graph.backlinks("Projects/Alpha.md").backlinks.len(), 2);
        assert_eq!(graph.len(), 4, "every sweep swapped a complete graph in");
    }

    #[test]
    fn concurrent_refreshes_and_reads_do_not_deadlock() {
        hammer(false);
    }

    #[test]
    fn concurrent_uncoalesced_sweeps_and_reads_do_not_deadlock() {
        hammer(true);
    }

    #[cfg(unix)]
    #[test]
    fn a_symlinked_note_is_stamped_through_the_link() {
        let d = native_linked();
        std::os::unix::fs::symlink(d.path().join("Home.md"), d.path().join("Link.md")).unwrap();
        let g = LinkGraph::new();
        g.refresh_now(&NativeVfs, &SystemClock, d.path());
        assert!(g.backlink_sources("Alpha").contains(&"Link.md".to_string()));
        assert_eq!(
            g.refresh_now(&NativeVfs, &SystemClock, d.path()).unchanged,
            5
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_dangling_symlink_is_not_an_unreadable_note() {
        let d = native_linked();
        std::os::unix::fs::symlink(d.path().join("not-yet.md"), d.path().join("Link.md")).unwrap();
        for errors in [Errors::Report, Errors::Propagate] {
            let g = LinkGraph::new().with_walk(WalkOptions {
                errors,
                ..LinkGraph::default_walk()
            });
            g.try_refresh_now(&NativeVfs, &SystemClock, d.path())
                .unwrap();
            assert!(g.paths().contains(&"Link.md".to_string()));
            assert!(g.unreadable().is_empty(), "{errors:?}");
        }
    }

    #[cfg(unix)]
    #[test]
    fn an_apply_keeps_a_symlink_the_walk_lists_whatever_it_points_at() {
        let d = native_linked();
        let elsewhere = tempfile::tempdir().unwrap();
        // A symlinked folder is listed as a file, and a dangling note link
        // as a note with nothing read.
        std::os::unix::fs::symlink(elsewhere.path(), d.path().join("assets")).unwrap();
        std::os::unix::fs::symlink(d.path().join("Gone.md"), d.path().join("Dangling.md")).unwrap();
        let g = LinkGraph::new();
        g.refresh_now(&NativeVfs, &SystemClock, d.path());
        let swept = g.paths();
        assert!(swept.contains(&"assets".to_string()));
        assert!(swept.contains(&"Dangling.md".to_string()));
        assert_eq!(g.len(), 5);

        let changed = ["assets".to_string(), "Dangling.md".to_string()];
        g.apply_changes(&NativeVfs, d.path(), &changed);
        assert_eq!(g.applied(), 1);
        assert_eq!(g.paths(), swept, "the apply agrees with the sweep");
        assert_eq!(g.len(), 5);
    }
}

#[test]
fn a_snapshot_is_the_paths_and_links_of_one_sweep() {
    let d = linked_vault();
    let g = graph();
    g.refresh(&*d, &FixedClock::new(0), root());
    let snap = g.snapshot();
    assert_eq!(snap.paths, g.paths());
    assert_eq!(snap.body_links, g.body_links());
    assert_eq!(snap.frontmatter_links, g.frontmatter_links());
    assert!(!snap.body_links.is_empty());
    assert!(
        snap.frontmatter_links
            .values()
            .all(|links| !links.is_empty()),
        "a note with no frontmatter links is left out"
    );
}
