//! Differential tests: `markdown_link::LinkIndex` versus Obsidian 1.13.4.
//!
//! The oracle is a **behaviour table** observed in Obsidian: a set of
//! input → output cases — given this vault and this reference, that file
//! opens. This file is the executable form of that table. It records what
//! Obsidian *does*, never how; `LinkIndex` is written from these cases rather
//! than from anything about the application's internals.
//!
//! The behaviours that matter most here, in one place:
//!
//! ```text
//! a unique basename resolves from anywhere; the source folder is irrelevant
//! a non-markdown target must carry its extension, or it resolves to nothing
//! an exact vault path beats a suffix match
//! ties prefer the linking note's own folder, then the shorter full path,
//!   measured in CHARACTERS rather than path segments
//! a rooted `/link` matches exactly or not at all — no fallback
//! `./` and `../` resolve against the linking note's folder
//! matching folds case and NFC; aliases do not resolve at all
//! a markdown link is a reference exactly as a wikilink is
//! ```
//!
//! Every test below asserts what `LinkIndex` actually does. Tests whose name
//! starts with `agrees_` assert the two implementations land on the same file.
//! Tests whose name starts with `diverges_` assert the current (different)
//! behaviour and state Obsidian's answer in a comment, so the file doubles as
//! the difference list. A plain, unprefixed name is a divergence or bug that
//! has since been fixed and is kept here as its regression test.
//!
//! The corpus is `tests/fixtures/vault/`, a checked-in vault built to be
//! pathological — its own README is the case-by-case table of what each file
//! is for and what Obsidian's answer is. Tests named `fixture_` guard the
//! corpus itself rather than the resolver; a handful of cases are still
//! built inline, each saying why on the spot.

use markdown_link::{
    LinkIndex, LinkKind, RawLink, body_links, md_link_target, normalize_target, parse_inner,
    strip_code,
};
use std::path::{Path, PathBuf};

// ---------------------------------------------------------------------------
// The fixture vault
// ---------------------------------------------------------------------------

/// The fixture vault's root, resolved from `CARGO_MANIFEST_DIR` at compile
/// time so nothing here depends on the current working directory.
fn fixture_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/vault")
}

/// Every file in the fixture vault, as vault-relative `/`-separated paths.
///
/// Dot-prefixed entries are skipped, which keeps a macOS `.DS_Store` or an
/// `.obsidian/` config directory out of the index without anyone noticing it
/// arrived. Sorted, so a failure prints the same list every time.
fn fixture_paths() -> Vec<String> {
    fn walk(dir: &Path, root: &Path, out: &mut Vec<String>) {
        let entries = std::fs::read_dir(dir)
            .unwrap_or_else(|e| panic!("fixture vault unreadable at {}: {e}", dir.display()));
        for entry in entries {
            let path = entry.expect("fixture dir entry").path();
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .expect("fixture path is not valid UTF-8")
                .to_string();
            if name.starts_with('.') {
                continue;
            }
            if path.is_dir() {
                walk(&path, root, out);
            } else {
                out.push(
                    path.strip_prefix(root)
                        .expect("walked below the root")
                        .to_str()
                        .expect("fixture path is not valid UTF-8")
                        .replace('\\', "/"),
                );
            }
        }
    }
    let root = fixture_root();
    let mut out = Vec::new();
    walk(&root, &root, &mut out);
    out.sort();
    out
}

/// The fixture vault, indexed.
fn fixture() -> LinkIndex {
    LinkIndex::build(&fixture_paths())
}

/// One fixture note's body, with any frontmatter block framed off.
fn note_body(rel: &str) -> String {
    let raw = read_note(rel);
    frontmatter_lossless::split_lenient(&raw).map_or(raw.clone(), |ls| ls.body.to_string())
}

/// One fixture note's frontmatter block, parsed.
fn note_frontmatter(rel: &str) -> yaml_splice::value::Mapping {
    let raw = read_note(rel);
    let ls = frontmatter_lossless::split_lenient(&raw)
        .unwrap_or_else(|| panic!("{rel} has no frontmatter block"));
    yaml_splice::parse::parse_mapping(ls.yaml)
        .unwrap_or_else(|e| panic!("{rel} frontmatter does not parse: {e}"))
}

fn read_note(rel: &str) -> String {
    let path = fixture_root().join(rel);
    std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("fixture note unreadable at {}: {e}", path.display()))
}

/// The targets `body_links` harvests from a fixture note, in order.
fn note_targets(rel: &str) -> Vec<String> {
    body_links(&note_body(rel))
        .into_iter()
        .map(|l| l.target)
        .collect()
}

/// An ad-hoc index, for the handful of cases the fixture cannot express.
fn vault(paths: &[&str]) -> LinkIndex {
    LinkIndex::build(&paths.iter().map(|p| (*p).to_string()).collect::<Vec<_>>())
}

/// The fixture is evidence, so its shape is asserted rather than assumed. Every
/// file has a row in `tests/fixtures/vault/README.md`; a file with no row does
/// not belong, and a file that quietly disappears takes a case with it.
#[test]
fn fixture_vault_holds_exactly_the_files_the_readme_documents() {
    assert_eq!(
        fixture_paths(),
        vec![
            "README.md",
            "aaa/tied.md",
            "assets/board.canvas",
            "assets/diagram.png",
            "capabilities/from-capabilities.md",
            "capabilities/plugin.md",
            "deeper/suffix/target.md",
            "frontmatter/hazards.md",
            "glossary.md",
            "glossary/from-glossary.md",
            "glossary/plugin.md",
            "glossary/terms/unique-term.md",
            "length-versus-depth-long-folder/tie.md",
            "note.md",
            "note.md.md",
            "parsing/code-spans.md",
            "parsing/embeds.md",
            "parsing/markdown-links.md",
            "parsing/pipes-and-sizes.md",
            "parsing/subpaths.md",
            "relative/nested/from-here.md",
            "relative/nested/sibling.md",
            "relative/sibling.md",
            "root-source.md",
            "scripts/check.py",
            "sibling.md",
            "snippet.md",
            "suffix/target.md",
            "unicode/Caf\u{e9}.md",
            "unicode/a\u{1f4dd}",
            "unicode/nbsp\u{a0}name.md",
            "unicode/nnbsp\u{202f}name.md",
            "unicode/\u{c9}COLE.md",
            "unicode/\u{41f}\u{440}\u{438}\u{432}\u{435}\u{442}",
            "x/y/tie.md",
            "zzz/tied.md",
        ]
    );
}

/// The path lengths the research quotes are load-bearing: Obsidian's step 11
/// sorts by character length, so a rename that changed one of these folders
/// would silently change the oracle's answer without changing any assertion.
#[test]
fn fixture_vault_preserves_the_path_lengths_the_cases_turn_on() {
    // The collision, quoted verbatim in the research.
    assert_eq!("capabilities/plugin.md".len(), 22);
    assert_eq!("glossary/plugin.md".len(), 18);
    // Length and depth disagreeing.
    assert_eq!("length-versus-depth-long-folder/tie.md".len(), 38);
    assert_eq!(
        "length-versus-depth-long-folder/tie.md".split('/').count(),
        2
    );
    assert_eq!("x/y/tie.md".len(), 10);
    assert_eq!("x/y/tie.md".split('/').count(), 3);
    // A genuine tie: same length, same depth.
    assert_eq!("aaa/tied.md".len(), "zzz/tied.md".len());
}

/// Seven colliding keys across the fixture, from six ambiguous basenames:
/// `plugin` (2 files), `target` and `suffix/target` (the same 2 files, twice),
/// `sibling` (3 files, so 2 collisions), `tie` (2) and `tied` (2). Pinned here
/// rather than in the counter's own test, which needs a vault built for it.
#[test]
fn fixture_vault_collides_exactly_where_it_means_to() {
    assert_eq!(fixture().collisions, 7);
}

// ---------------------------------------------------------------------------
// Step 0 — empty linkpath
// ---------------------------------------------------------------------------

/// Obsidian step 0: `[[#heading]]` resolves to the source file itself.
/// `parse_inner` rejects an empty target outright, so the reference never even
/// reaches the index — `body_links` drops it and the link vanishes.
#[test]
fn diverges_same_file_subpath_links_are_dropped_not_resolved_to_self() {
    assert_eq!(parse_inner("#heading", false), None);
    assert_eq!(parse_inner("#^blockid", false), None);
    assert!(body_links("see [[#heading]] and ![[#^abc]]").is_empty());
    // `parsing/subpaths.md` writes both same-file forms. Neither survives the
    // harvest: every target it yields is a real note name.
    let body = note_body("parsing/subpaths.md");
    assert!(body.contains("[[#Heading]]"));
    assert!(body.contains("[[#^abc123]]"));
    assert!(
        !note_targets("parsing/subpaths.md")
            .iter()
            .any(String::is_empty)
    );
    // Obsidian: both resolve to the containing note.
}

// ---------------------------------------------------------------------------
// Steps 2/3 — the key, and the `.md` retry
// ---------------------------------------------------------------------------

#[test]
fn agrees_md_suffixed_links_are_identical_to_bare_ones() {
    let idx = fixture();
    let unique = Some("glossary/terms/unique-term.md");
    assert_eq!(idx.resolve("unique-term"), unique);
    assert_eq!(idx.resolve("unique-term.md"), unique);
    assert_eq!(idx.resolve("glossary/terms/unique-term.md"), unique);
    // Obsidian: step 3's ".md" retry makes these equivalent too.
}

/// FIXED: `.md` used to
/// be stripped twice — once by `build` to form the key path, then again by
/// `normalize_target` on every suffix — so `note.md.md` was indexed under the
/// key `note`, answered to names that are not its own, and collided a real
/// `note.md` out of the index entirely. `build` no longer strips;
/// `normalize_target` is the single strip point and runs symmetrically over
/// index keys and query targets.
#[test]
fn a_doubled_md_filename_is_reachable_by_its_own_name() {
    // In the fixture the two live side by side, each under its own key.
    let idx = fixture();
    assert_eq!(idx.resolve("note"), Some("note.md"));
    assert_eq!(idx.resolve("note.md"), Some("note.md"));
    assert_eq!(idx.resolve("note.md.md"), Some("note.md.md"));
    // Obsidian: identical on all three.

    // Alone in a vault it answers to its own name and to nothing else. A vault
    // of exactly one file is a property of the vault, not of the file, so it
    // cannot be a row in a shared fixture.
    let alone = vault(&["note.md.md"]);
    assert_eq!(alone.resolve("note.md.md"), Some("note.md.md"));
    assert_eq!(alone.resolve("note"), None);
    // Obsidian agrees on both. It ALSO answers `[[note.md]]` here, via step 3's
    // ".md" retry on the miss; matching that needs the index and the query to
    // keep their extensions and move extension handling into the lookup, which
    // is the deferred resolver redesign rather than a single-strip fix.
    assert_eq!(alone.resolve("note.md"), None);

    // Neither name costs the other a key. `collisions` counts over a whole
    // vault, so the pair is weighed on its own here rather than against the
    // fixture's global total.
    let pair = vault(&["note.md", "note.md.md"]);
    assert_eq!(pair.len(), 2);
    assert_eq!(pair.collisions, 0);
}

#[test]
fn agrees_non_markdown_files_need_their_extension() {
    let idx = fixture();
    assert_eq!(idx.resolve("diagram.png"), Some("assets/diagram.png"));
    assert_eq!(idx.resolve("board.canvas"), Some("assets/board.canvas"));
    assert_eq!(idx.resolve("check.py"), Some("scripts/check.py"));
    // Obsidian: step 3 turns a bare `[[diagram]]` into a lookup of "diagram.md",
    // which misses. Same here — the bare stem is not a key.
    assert_eq!(idx.resolve("diagram"), None);
    assert_eq!(idx.resolve("board"), None);
    assert_eq!(idx.resolve("check"), None);
}

// ---------------------------------------------------------------------------
// Step 4 vs the crate's basename fallback — the largest behavioural difference
// ---------------------------------------------------------------------------

/// `LinkIndex::resolve` (src/lib.rs:368-373) retries a pathed miss as its bare
/// basename. Obsidian has no such step: candidates come from the basename
/// multimap and step 9 can only *remove* them, so when the written folder does
/// not suffix-match any candidate the result is `[]` — an unresolved link.
#[test]
fn diverges_a_wrong_folder_still_resolves_via_the_basename_fallback() {
    let idx = fixture();
    let unique = Some("glossary/terms/unique-term.md");
    assert_eq!(idx.resolve("made-up/unique-term"), unique);
    assert_eq!(idx.resolve("totally/made/up/unique-term"), unique);
    // Obsidian: None for both — the link renders unresolved.
}

/// The same file, reached by a different route.
///
/// Obsidian's suffix match is a RAW string `endsWith`, so it keeps
/// `glossary/plugin.md` for `[[ary/plugin]]` — that path really does end with
/// "ary/plugin.md". `suffixes()` only ever emits keys at segment boundaries, so
/// "ary/plugin" misses here and the basename fallback fires instead.
///
/// The two used to disagree about the answer as well as the route. They no
/// longer do: with the tie-break on path length, the fallback lands on the same
/// file. The mechanism still differs and the outcome no longer does, which is
/// the only half a reader can see.
#[test]
fn agrees_on_the_file_though_the_fallback_takes_a_different_route() {
    let idx = fixture();
    assert_eq!(idx.resolve("ary/plugin"), Some("glossary/plugin.md"));
}

// ---------------------------------------------------------------------------
// Step 5 — the single-candidate fast path
// ---------------------------------------------------------------------------

#[test]
fn agrees_a_unique_basename_resolves_from_anywhere() {
    let idx = fixture();
    for t in [
        "unique-term",
        "terms/unique-term",
        "glossary/terms/unique-term",
    ] {
        assert_eq!(idx.resolve(t), Some("glossary/terms/unique-term.md"), "{t}");
    }
    // Obsidian step 5 ignores the source folder for a unique basename, so this
    // is source-independent on both sides. `parsing/pipes-and-sizes.md` and
    // `parsing/code-spans.md` link it from two different folders.
    assert!(
        note_targets("parsing/code-spans.md").contains(&"glossary/terms/unique-term".to_string())
    );
}

#[test]
fn agrees_a_link_to_nothing_resolves_to_nothing() {
    // `root-source.md` writes `[[nowhere]]` and `parsing/embeds.md` embeds it.
    // No file in the fixture answers to that name, deliberately.
    assert!(note_targets("root-source.md").contains(&"nowhere".to_string()));
    assert!(note_targets("parsing/embeds.md").contains(&"nowhere".to_string()));
    assert_eq!(fixture().resolve("nowhere"), None);
    // Obsidian: null, and the link appears in `unresolvedLinks`.
}

// ---------------------------------------------------------------------------
// Step 6 — relative links
// ---------------------------------------------------------------------------

/// `normalize_target` (src/lib.rs:310-312) strips a leading `./` and treats the
/// rest as a vault-wide target. Obsidian resolves `./` against the SOURCE
/// note's folder, so the two answers only coincide by luck.
#[test]
fn diverges_dot_slash_is_flattened_instead_of_resolved_against_the_source() {
    // The ladder: sibling.md, relative/sibling.md, relative/nested/sibling.md.
    assert_eq!(note_targets("relative/nested/from-here.md")[0], "./sibling");
    assert_eq!(normalize_target("./sibling"), "sibling");
    assert_eq!(fixture().resolve("./sibling"), Some("sibling.md"));
    // Obsidian, for `[[./sibling]]` written in relative/nested/from-here.md:
    // Some("relative/nested/sibling.md").
}

/// `../` is not handled at all: it survives normalisation, misses the index,
/// and then the basename fallback discards the whole relative prefix.
#[test]
fn diverges_dot_dot_slash_falls_through_to_the_basename_fallback() {
    assert_eq!(
        note_targets("relative/nested/from-here.md")[1],
        "../sibling"
    );
    assert_eq!(normalize_target("../sibling"), "../sibling");
    assert_eq!(fixture().resolve("../sibling"), Some("sibling.md"));
    // Obsidian, for `[[../sibling]]` written in relative/nested/from-here.md:
    // Some("relative/sibling.md") — one rung up, not all the way to the root.
}

/// Resolved from the linking note, `./` and `../` land where Obsidian's do.
/// The two `diverges_` cases above resolve from the vault root, where no
/// relative answer exists, so they still take the vault-wide lookup.
#[test]
fn relative_links_resolve_against_the_source_folder() {
    let from = "relative/nested/from-here.md";
    let index = fixture();
    assert_eq!(
        index.resolve_from("./sibling", from),
        Some("relative/nested/sibling.md")
    );
    assert_eq!(
        index.resolve_from("../sibling", from),
        Some("relative/sibling.md")
    );
    assert_eq!(
        index.resolve_from("../../sibling", from),
        Some("sibling.md")
    );
}

/// A relative path names its copy even where the bare name would pick the
/// other one. A path that names no file, or climbs out of the vault, falls
/// back to the vault-wide lookup.
#[test]
fn a_relative_miss_falls_back_to_the_vault_wide_lookup() {
    let index = vault(&["img/a.png", "x/a.png", "notes/N.md"]);
    assert_eq!(
        index.resolve_from("../img/a.png", "notes/N.md"),
        Some("img/a.png")
    );
    assert_eq!(
        index.resolve_from("../x/a.png", "notes/N.md"),
        Some("x/a.png")
    );
    assert_eq!(
        index.resolve_from("../../a.png", "notes/N.md"),
        index.resolve("a.png")
    );
    assert_eq!(
        index.resolve_from("../gone/a.png", "notes/N.md"),
        index.resolve("a.png")
    );
}

// ---------------------------------------------------------------------------
// Step 7 — exact path
// ---------------------------------------------------------------------------

#[test]
fn agrees_an_exact_path_beats_a_longer_path_that_ends_with_it() {
    let idx = fixture();
    // The build-time sort is shortest-first, and a file whose FULL path is the
    // key always has fewer segments than any file merely ending with it, so
    // exact-match priority survives the flattening into one map.
    assert_eq!(idx.resolve("suffix/target"), Some("suffix/target.md"));
    assert_eq!(
        idx.resolve("deeper/suffix/target"),
        Some("deeper/suffix/target.md")
    );
}

// ---------------------------------------------------------------------------
// Step 8 — rooted links
// ---------------------------------------------------------------------------

/// `normalize_target` never strips a leading `/`, so a rooted link always
/// misses the index and lands in the basename fallback — the exact opposite of
/// Obsidian step 8, which says a rooted miss is final.
#[test]
fn diverges_rooted_links_fall_back_instead_of_failing() {
    let idx = fixture();
    assert_eq!(normalize_target("/suffix/target"), "/suffix/target");
    // Right answer, wrong route — the exact path never matched.
    assert_eq!(idx.resolve("/suffix/target"), Some("suffix/target.md"));
    // Still wrong, and for the same reason: Obsidian returns None for a rooted
    // path that does not exist, while this falls back to the basename. Only
    // WHICH file the fallback picks has changed, now that ties break on path
    // length — the divergence being pinned is the fallback happening at all.
    assert_eq!(idx.resolve("/nowhere/plugin"), Some("glossary/plugin.md"));
    // When the rooted path is real the answer now agrees, but by luck rather
    // than by route: the basename winner happens to BE the file that was
    // named. Obsidian gets here by exact match with no tie-break at all, so a
    // second file named plugin.md with a shorter path would part them again.
    assert_eq!(idx.resolve("/glossary/plugin"), Some("glossary/plugin.md"));

    // All four rooted forms are written down in `root-source.md`.
    let written = note_targets("root-source.md");
    for form in [
        "/glossary/plugin",
        "/nowhere/plugin",
        "/note",
        "/suffix/target",
    ] {
        assert!(written.contains(&form.to_string()), "{form}");
    }
}

/// And a rooted link to a vault-root file fails, because the fallback bails
/// when the only slash is at index 0 (src/lib.rs:370-372).
#[test]
fn diverges_a_rooted_link_to_a_root_level_file_resolves_to_nothing() {
    let idx = fixture();
    assert_eq!(idx.resolve("note"), Some("note.md"));
    assert_eq!(idx.resolve("/note"), None);
    // Obsidian: Some("note.md") — the exact path matches once rooted.
}

// ---------------------------------------------------------------------------
// Steps 10 and 11 — the tie-break, where reimplementations diverge
// ---------------------------------------------------------------------------

/// One bare name, two files that answer to it, three places to write it from —
/// the case the whole fixture exists for.
///
/// `resolve_from` takes the linking note's path, so a candidate in that note's
/// own folder can be preferred. `resolve` keeps answering as if written at the
/// vault root, where the preference is vacuous.
#[test]
fn agrees_the_linking_notes_own_folder_wins_a_tie() {
    let idx = fixture();
    for source in [
        "capabilities/from-capabilities.md",
        "glossary/from-glossary.md",
        "root-source.md",
    ] {
        assert!(
            note_targets(source).contains(&"plugin".to_string()),
            "{source} should write a bare [[plugin]]"
        );
    }
    assert!(idx.collisions > 0);

    // Each folder keeps its own.
    assert_eq!(
        idx.resolve_from("plugin", "capabilities/from-capabilities.md"),
        Some("capabilities/plugin.md")
    );
    assert_eq!(
        idx.resolve_from("plugin", "glossary/from-glossary.md"),
        Some("glossary/plugin.md")
    );
    // A note at the vault root has no folder, so nothing can be preferred on
    // those grounds and the shorter path wins: 18 characters against 22.
    assert_eq!(
        idx.resolve_from("plugin", "root-source.md"),
        Some("glossary/plugin.md")
    );
    // …which is also what the source-independent form answers.
    assert_eq!(idx.resolve("plugin"), Some("glossary/plugin.md"));

    // A folder holding no candidate does not invent one.
    assert_eq!(
        idx.resolve_from("plugin", "parsing/embeds.md"),
        Some("glossary/plugin.md")
    );
}

/// A tie breaks on full path LENGTH, which is not the same as depth.
///
/// This used to sort by segment count, and the two orders disagree exactly
/// when a shallow-but-long path competes with a deep-but-short one — which is
/// what this fixture pair is built to be.
#[test]
fn agrees_the_tie_break_is_path_length_not_depth() {
    let long_but_shallow = "length-versus-depth-long-folder/tie.md"; // 38 chars, 2 segments
    let short_but_deep = "x/y/tie.md"; // 10 chars, 3 segments
    assert!(long_but_shallow.len() > short_but_deep.len());
    assert_eq!(fixture().resolve("tie"), Some(short_but_deep));
}

/// Where Obsidian's step 11 bottoms out in `Array.prototype.sort` stability
/// (i.e. vault traversal order — the research document's own "Open" item),
/// `LinkIndex` breaks the tie with `slug_collate::compare_paths`. Deterministic, and
/// deterministically not the same rule.
#[test]
fn diverges_equal_length_ties_are_broken_lexicographically_not_by_scan_order() {
    assert_eq!(fixture().resolve("tied"), Some("aaa/tied.md"));
    // Obsidian: whichever of the two entered the index first. Stable within a
    // session, not guaranteed across machines or a cache rebuild.
}

/// `collisions` counts colliding suffix KEYS, not ambiguous names, so one
/// ambiguous basename in a nested tree bumps it more than once. Callers that
/// read it as "how many names are ambiguous" will over-report.
///
/// Built inline on purpose: the claim is arithmetic over a whole vault, and the
/// smallest vault that isolates one ambiguous name from two colliding keys is
/// this one. Against the fixture the number is a sum over every case at once —
/// pinned in `fixture_vault_collides_exactly_where_it_means_to` instead.
#[test]
fn diverges_the_collision_counter_counts_keys_not_ambiguous_files() {
    let one_level = vault(&["a/note.md", "b/note.md"]);
    assert_eq!(one_level.collisions, 1);
    let two_levels = vault(&["x/shared/note.md", "z/shared/note.md"]);
    // One ambiguous name, two colliding keys: "note" and "shared/note".
    assert_eq!(two_levels.collisions, 2);
}

// ---------------------------------------------------------------------------
// Case folding and Unicode normalisation
// ---------------------------------------------------------------------------

#[test]
fn agrees_matching_is_case_insensitive_including_non_ascii() {
    let idx = fixture();
    // README.md is the fixture's one mixed-case ASCII name.
    assert_eq!(idx.resolve("readme"), Some("README.md"));
    assert_eq!(idx.resolve("README.md"), Some("README.md"));
    assert_eq!(idx.resolve("\u{e9}cole"), Some("unicode/\u{c9}COLE.md"));
    assert_eq!(idx.resolve("\u{c9}cole"), Some("unicode/\u{c9}COLE.md"));
    // Obsidian lowercases both sides too (step 1 and the index keys).
}

/// Obsidian NFC-normalises BOTH the path index and the linktext before
/// comparing, precisely so a macOS-decomposed filename matches a composed link.
/// `normalize_target` (src/lib.rs:308-318) does no normalisation at all, so an
/// NFD path and an NFC link are two different keys.
#[test]
fn diverges_no_nfc_normalisation_on_either_side() {
    let nfc = "Caf\u{e9}"; // precomposed é
    let nfd = "Cafe\u{301}"; // e + COMBINING ACUTE

    // The fixture holds the precomposed half: `unicode/Café.md`.
    let idx = fixture();
    assert_eq!(idx.resolve(nfc), Some("unicode/Caf\u{e9}.md"));
    assert_eq!(idx.resolve(nfd), None);
    // Obsidian: both forms resolve, because both sides are folded to NFC.

    // And symmetrically, an NFD file is unreachable from an NFC link. The
    // decomposed half is built as a string rather than checked in: git on macOS
    // reads working-tree paths back precomposed (`core.precomposeunicode`), so
    // an NFD path in the index leaves that platform with a permanently dirty
    // tree. See the fixture README's "Cases that cannot be real files".
    let decomposed_on_disk = vault(&["Cafe\u{301}.md"]);
    assert_eq!(decomposed_on_disk.resolve(nfd), Some("Cafe\u{301}.md"));
    assert_eq!(decomposed_on_disk.resolve(nfc), None);
}

/// Obsidian folds `U+00A0` and `U+202F` to a plain space in PATHS (`Ml` inside
/// `normalizePath`) and `U+00A0` only in LINK TEXT. `wikilink` folds neither,
/// which diverges in both directions.
#[test]
fn diverges_no_nbsp_folding_in_paths_or_link_text() {
    let idx = fixture();

    // U+00A0 in the filename: Obsidian indexes it under a plain space, so a
    // link typed with a plain space resolves. Here it does not.
    assert_eq!(idx.resolve("nbsp name"), None);
    assert_eq!(
        idx.resolve("nbsp\u{a0}name"),
        Some("unicode/nbsp\u{a0}name.md")
    );

    // U+202F is Obsidian's own asymmetry bug: the path folds, the link text
    // does not, so the link NEVER matches its file. `wikilink` folds neither
    // and therefore resolves where Obsidian silently fails.
    assert_eq!(
        idx.resolve("nnbsp\u{202f}name"),
        Some("unicode/nnbsp\u{202f}name.md")
    );
    // Obsidian: None.
    assert_eq!(idx.resolve("nnbsp name"), None);
    // Obsidian: also None, but for the opposite reason — the index key there IS
    // "nnbsp name.md" and it is the link text that keeps the narrow space.
}

// ---------------------------------------------------------------------------
// Path shape normalisation
// ---------------------------------------------------------------------------

#[test]
fn agrees_backslashes_and_redundant_slashes_normalise() {
    let idx = fixture();
    let unique = Some("glossary/terms/unique-term.md");
    assert_eq!(idx.resolve("glossary\\terms\\unique-term"), unique);
    assert_eq!(idx.resolve("glossary//terms//unique-term.md"), unique);
}

#[test]
fn agrees_a_name_colliding_with_a_folder_is_not_confused_with_it() {
    let idx = fixture();
    assert_eq!(idx.resolve("glossary"), Some("glossary.md"));
    assert_eq!(idx.resolve("glossary/plugin"), Some("glossary/plugin.md"));
    assert_eq!(
        idx.resolve("from-glossary"),
        Some("glossary/from-glossary.md")
    );
    // Obsidian never indexes folders either — `uniqueFileLookup` is files only.
}

// ---------------------------------------------------------------------------
// parse_inner — the documented parser details
// ---------------------------------------------------------------------------

#[test]
fn agrees_the_target_splits_at_the_first_pipe() {
    // `parsing/pipes-and-sizes.md` writes `![[assets/diagram.png|alt text|300]]`.
    let body = note_body("parsing/pipes-and-sizes.md");
    assert!(body.contains("![[assets/diagram.png|alt text|300]]"));
    let l = parse_inner("assets/diagram.png|alt text|300", true).unwrap();
    assert_eq!(l.target, "assets/diagram.png");
    // Obsidian agrees on the target. It then reads the LAST segment as a size
    // and the middle as the caption; `parse_inner` keeps the whole tail as one
    // alias — see the next test.
    assert_eq!(l.alias.as_deref(), Some("alt text|300"));

    // A plain alias is unambiguous on both sides.
    let plain = parse_inner("glossary/terms/unique-term|the unique term", false).unwrap();
    assert_eq!(plain.target, "glossary/terms/unique-term");
    assert_eq!(plain.alias.as_deref(), Some("the unique term"));
    assert_eq!(
        fixture().resolve(&plain.target),
        Some("glossary/terms/unique-term.md")
    );
}

/// "The target splits at the first `|`, the size parses from the LAST."
/// `parse_inner` keeps everything after the first `|` as the alias, and
/// `display_text` reads a trailing size off an embed's alias, so the size is
/// never shown as text.
#[test]
fn agrees_an_embed_size_is_not_display_text() {
    let body = note_body("parsing/pipes-and-sizes.md");
    assert!(body.contains("![[assets/diagram.png|300x200]]"));
    let l = parse_inner("assets/diagram.png|300x200", true).unwrap();
    assert_eq!(l.alias.as_deref(), Some("300x200"));
    // Obsidian renders the image at 300x200, with no caption.
    assert_eq!(
        markdown_link::display_text("![[assets/diagram.png|300x200]]"),
        "assets/diagram.png"
    );
}

#[test]
fn agrees_the_subpath_splits_at_the_first_hash() {
    let body = note_body("parsing/subpaths.md");
    assert!(body.contains("[[note#Heading]]"));
    let l = parse_inner("note#Heading|Alias", false).unwrap();
    assert_eq!(l.target, "note");
    assert_eq!(l.heading.as_deref(), Some("Heading"));
    assert_eq!(l.alias.as_deref(), Some("Alias"));

    // A heading chain keeps the remaining `#`s verbatim, as `parseLinktext`
    // does (it splits on the FIRST `#` only).
    assert!(body.contains("[[note#h#sub]]"));
    let chained = parse_inner("note#h#sub", false).unwrap();
    assert_eq!(chained.target, "note");
    assert_eq!(chained.heading.as_deref(), Some("h#sub"));

    // A `#` after the first `|` belongs to the alias, not the subpath.
    assert!(body.contains("[[note|alias#notaheading]]"));
    let piped = parse_inner("note|alias#notaheading", false).unwrap();
    assert_eq!(piped.target, "note");
    assert_eq!(piped.heading, None);
    assert_eq!(piped.alias.as_deref(), Some("alias#notaheading"));
}

/// Inside a GFM table cell the alias pipe is written `\|`. The `\` is an
/// escape, so it belongs to neither the target nor the heading.
#[test]
fn escaped_alias_pipe_is_not_part_of_the_target() {
    let l = parse_inner("Note\\|alias", false).unwrap();
    assert_eq!(l.target, "Note");
    assert_eq!(l.heading, None);
    assert_eq!(l.alias.as_deref(), Some("alias"));

    let h = parse_inner("Note#Heading\\|alias", false).unwrap();
    assert_eq!(h.target, "Note");
    assert_eq!(h.heading.as_deref(), Some("Heading"));
    assert_eq!(h.alias.as_deref(), Some("alias"));

    let e = parse_inner("Note\\|alias", true).unwrap();
    assert_eq!(e.target, "Note");
    assert!(e.embed);

    // Exactly one backslash is the escape.
    assert_eq!(
        parse_inner("Note\\\\|alias", false).unwrap().target,
        "Note\\"
    );
    // A backslash not before the first pipe stays literal.
    assert_eq!(parse_inner("Note\\", false).unwrap().target, "Note\\");
    assert_eq!(
        parse_inner("Note|a\\|b", false).unwrap().alias.as_deref(),
        Some("a\\|b")
    );
    // A plain pipe is unchanged.
    assert_eq!(parse_inner("Note|alias", false).unwrap().target, "Note");

    let links = body_links("| a |\n|---|\n| [[Note\\|alias]] ![[Pic\\|300]] |");
    let targets: Vec<_> = links.iter().map(|l| l.target.as_str()).collect();
    assert_eq!(targets, ["Note", "Pic"]);
}

/// A block id is not distinguished from a heading — it is stored raw in
/// `heading`, `^` included. Callers can detect it, but nothing in the crate
/// does. Obsidian keeps the two apart (`resolveSubpath` branches on `^`).
#[test]
fn diverges_block_ids_are_stored_as_headings() {
    assert!(note_body("parsing/subpaths.md").contains("[[note#^abc123]]"));
    let l = parse_inner("note#^abc123", false).unwrap();
    assert_eq!(l.target, "note");
    assert_eq!(l.heading.as_deref(), Some("^abc123"));
    // The footnote form is parse-only: its inner `[` makes the whole reference
    // malformed to `body_links`, so it cannot be written into a fixture note
    // and still be harvested.
    assert_eq!(
        parse_inner("note#[^fn1]", false)
            .unwrap()
            .heading
            .as_deref(),
        Some("[^fn1]")
    );
    assert!(body_links("[[note#[^fn1]]]").is_empty());
}

#[test]
fn agrees_embeds_and_links_are_distinct_kinds() {
    let links = body_links(&note_body("parsing/embeds.md"));
    assert_eq!(
        links
            .iter()
            .map(|l| (l.kind, l.target.as_str()))
            .collect::<Vec<_>>(),
        vec![
            // A real transclusion, then three peer resources.
            (LinkKind::Embed, "snippet"),
            (LinkKind::Embed, "assets/diagram.png"),
            (LinkKind::Embed, "scripts/check.py"),
            (LinkKind::Embed, "assets/board.canvas"),
            // The same note as a plain link, twice.
            (LinkKind::Wikilink, "snippet"),
            (LinkKind::Wikilink, "snippet"),
            // And an embed of a file that does not exist.
            (LinkKind::Embed, "nowhere"),
        ]
    );
    // The transclusion target is a real note; the peer resources are not.
    let idx = fixture();
    assert_eq!(idx.resolve("snippet"), Some("snippet.md"));
    assert_eq!(
        idx.resolve("assets/diagram.png"),
        Some("assets/diagram.png")
    );
}

/// The compiler needs to REFUSE `![[note#heading]]` and `![[note#^blockid]]`
/// in Alpha. `body_links` cannot express that: `RawLink` carries only
/// target/kind/field (src/lib.rs:31-38), so a sectioned embed is
/// indistinguishable from a whole-note embed once harvested. Only the
/// lower-level `parse_inner` retains the subpath.
#[test]
fn diverges_body_links_discards_the_subpath_a_compiler_must_refuse_on() {
    // `parsing/subpaths.md` writes `![[note]]`, `![[note#Heading]]` and
    // `![[note#^abc123]]` — three different intents, one harvested shape.
    let embeds: Vec<RawLink> = body_links(&note_body("parsing/subpaths.md"))
        .into_iter()
        .filter(|l| l.kind == LinkKind::Embed && l.target == "note")
        .collect();
    assert_eq!(embeds.len(), 3);
    assert_eq!(embeds[0], embeds[1]);
    assert_eq!(embeds[0], embeds[2]);
    // Same for a PDF page fragment, which is neither a heading nor a block.
    assert!(
        note_targets("parsing/subpaths.md").contains(&"assets/doc.pdf".to_string()),
        "the `#page=3` fragment should be gone from the target"
    );
    // parse_inner does keep it, so the information exists — just not on the
    // path a caller would naturally take.
    assert_eq!(
        parse_inner("note#Heading", true)
            .unwrap()
            .heading
            .as_deref(),
        Some("Heading")
    );
}

#[test]
fn agrees_non_markdown_embeds_are_harvested_with_their_extension() {
    let targets = note_targets("parsing/embeds.md");
    for t in [
        "assets/diagram.png",
        "scripts/check.py",
        "assets/board.canvas",
    ] {
        assert!(targets.contains(&t.to_string()), "{t}");
    }
    let idx = fixture();
    assert_eq!(
        idx.resolve("assets/diagram.png"),
        Some("assets/diagram.png")
    );
    assert_eq!(
        idx.resolve("assets/board.canvas"),
        Some("assets/board.canvas")
    );
    assert_eq!(idx.resolve("scripts/check.py"), Some("scripts/check.py"));
}

/// `body_links` reports no byte or char offsets, so a caller cannot splice a
/// rewritten link back into the source. Obsidian's `LinkCache`/`EmbedCache`
/// carry `position`, which is what the compiler's rewrite step needs.
#[test]
fn diverges_harvested_links_carry_no_position() {
    // `parsing/embeds.md` writes `[[snippet]]` twice, in two different places.
    let plain: Vec<RawLink> = body_links(&note_body("parsing/embeds.md"))
        .into_iter()
        .filter(|l| l.kind == LinkKind::Wikilink && l.target == "snippet")
        .collect();
    // Two references to the same target, and no way to tell them apart or to
    // find either one in the source text.
    assert_eq!(plain.len(), 2);
    assert_eq!(plain[0], plain[1]);
}

// ---------------------------------------------------------------------------
// strip_code
// ---------------------------------------------------------------------------

#[test]
fn agrees_backtick_fences_and_inline_spans_are_blanked() {
    let targets = note_targets("parsing/code-spans.md");
    assert!(targets.contains(&"glossary/terms/unique-term".to_string()));
    assert!(!targets.contains(&"fenced-should-not-resolve".to_string()));
    assert!(!targets.contains(&"inline-should-not-resolve".to_string()));
}

/// Obsidian's cache records no references inside a tilde fence either.
#[test]
fn tilde_fences_are_stripped() {
    assert!(
        !note_targets("parsing/code-spans.md").contains(&"tilde-should-not-resolve".to_string())
    );
}

/// A double-backtick inline span, the CommonMark way to hold a literal
/// backtick, is code as a whole.
#[test]
fn double_backtick_inline_spans_are_stripped() {
    assert!(
        !note_targets("parsing/code-spans.md")
            .contains(&"double-backtick-should-not-resolve".to_string())
    );
}

/// The fence in the list item is indented four spaces, one too many for a
/// fence marker. Its two backtick runs still pair up as one inline span,
/// because no line between them ends the span's block, so the link between
/// them is stripped.
#[test]
fn agrees_a_list_item_fence_without_a_blank_line_is_stripped_as_a_span() {
    let targets = note_targets("parsing/code-spans.md");
    assert!(!targets.contains(&"indented-fence-should-not-resolve".to_string()));
    // The note yields exactly its one real reference.
    assert_eq!(targets, vec!["glossary/terms/unique-term"]);
}

/// A blank line inside that list-item fence ends the span's block, so the two
/// backtick runs no longer pair up and the links inside leak. `strip_code`
/// reads one line at a time and does not know the fence belongs to the list
/// item (src/code.rs).
#[test]
fn diverges_a_list_item_fence_with_a_blank_line_leaks_its_links() {
    let body = "- a list item\n\n    ```\n    [[a]]\n\n    [[b]]\n    ```\n";
    let targets: Vec<String> = body_links(body).into_iter().map(|l| l.target).collect();
    assert_eq!(targets, vec!["a", "b"]);
    // Obsidian: no reference harvested.
}

/// A line starting with `|` is a one-line block to `strip_code`, so a span in
/// a table row may cross a cell. GFM splits the row into cells first, so
/// neither backtick here opens a span (src/code.rs).
#[test]
fn diverges_a_span_in_a_table_row_crosses_cells() {
    let body = "| a | b |\n|---|---|\n| `[[x]] | y` |\n";
    assert!(body_links(body).is_empty());
    // Obsidian: [[x]] is harvested.
}

/// `strip_code` (src/code.rs) keeps CHAR offsets, not byte offsets: each
/// stripped char becomes one space, so any multi-byte content inside code
/// shortens the output in bytes. Its doc comment says so; this pins it.
#[test]
fn diverges_strip_code_preserves_char_offsets_not_byte_offsets() {
    let body = note_body("parsing/code-spans.md");
    let out = strip_code(&body);
    assert_eq!(out.chars().count(), body.chars().count());
    assert_ne!(out.len(), body.len());

    // The line that costs the bytes: an inline span holding three CJK chars.
    let src = body
        .lines()
        .find(|l| l.starts_with("Multi-byte inside code:"))
        .expect("parsing/code-spans.md should hold a multi-byte inline span");
    assert_eq!(
        src,
        "Multi-byte inside code: `\u{65e5}\u{672c}\u{8a9e}` after."
    );
    // Backtick + three chars + backtick, five chars, five spaces.
    assert_eq!(
        strip_code(src),
        format!("Multi-byte inside code:{}after.", " ".repeat(7))
    );
}

// ---------------------------------------------------------------------------
// Markdown links
// ---------------------------------------------------------------------------

#[test]
fn agrees_relative_markdown_links_are_references_and_urls_are_not() {
    let targets = note_targets("parsing/markdown-links.md");
    // `[the note](note.md)` is a reference.
    assert!(targets.contains(&"note".to_string()));
    // An `https:` URL and an `obsidian:` URI are not, even ending in `.md`.
    let body = note_body("parsing/markdown-links.md");
    assert!(body.contains("(https://example.com/y.md)"));
    assert!(body.contains("(obsidian://open?file=note.md)"));
    assert!(!targets.iter().any(|t| t.contains("example.com")));
    assert!(!targets.iter().any(|t| t.starts_with("obsidian:")));
}

/// Obsidian caches `[text](<sp ace.md>)`; the harvest regex (src/lib.rs:160)
/// excludes whitespace from the captured path, so an angle-bracketed target
/// containing a space is silently dropped.
#[test]
fn diverges_angle_bracketed_markdown_paths_with_spaces_are_dropped() {
    let body = note_body("parsing/markdown-links.md");
    assert!(body.contains("[angled](<sp ace.md>)"));
    assert!(body_links("[c](<sp ace.md>)").is_empty());
    // Percent-encoded spaces do work, and the same note writes one.
    assert!(body.contains("[spaced](sp%20ace.md)"));
    assert!(note_targets("parsing/markdown-links.md").contains(&"sp ace".to_string()));
}

/// `trim_end_matches(".md")` strips EVERY trailing `.md`, so a markdown link to
/// a file genuinely named `note.md.md` loses both. A wikilink to the same file
/// loses only one — the two harvest paths disagree with each other as well as
/// with Obsidian.
#[test]
fn diverges_markdown_links_strip_repeated_md_extensions() {
    // The note writes both syntaxes against the same real file.
    let body = note_body("parsing/markdown-links.md");
    assert!(body.contains("[doubled](note.md.md)"));
    assert!(body.contains("[[note.md.md]]"));

    // Asserted on the two functions rather than on the note's scan order: the
    // scan now harvests this note's attachment references too, so neither
    // `links[0]` nor `links.last()` names the pair under test any more. The
    // divergence was never about position.
    let links = body_links(&body);
    assert!(
        links.iter().any(|l| l.target == "note.md.md"),
        "the wikilink keeps the name whole"
    );
    assert_eq!(
        md_link_target("note.md.md"),
        "note",
        "the markdown form takes both extensions off"
    );

    assert_eq!(normalize_target("note.md.md"), "note.md");
    let idx = fixture();
    assert_eq!(idx.resolve("note.md.md"), Some("note.md.md"));
    assert_eq!(idx.resolve("note"), Some("note.md"));
    // Obsidian: the reference is to "note.md.md" in both syntaxes.
}

/// Markdown syntax naming an attachment is harvested, the way Obsidian caches
/// it: the image as an embed, the PDF as a link.
///
/// This used to be a divergence — only `.md` targets were harvested — and it is
/// why `![](cat.png)` never entered a document's link table and so had no
/// resolution to consult, while `![[cat.png]]` did.
#[test]
fn agrees_markdown_references_to_attachments_are_harvested() {
    let body = note_body("parsing/markdown-links.md");
    assert!(body.contains("![diagram](assets/diagram.png)"));
    assert!(body.contains("[spec](assets/doc.pdf)"));
    let targets = note_targets("parsing/markdown-links.md");
    assert!(targets.iter().any(|t| t == "assets/diagram.png"));
    assert!(targets.iter().any(|t| t == "assets/doc.pdf"));

    // …and they resolve, which is the whole point of harvesting them.
    let idx = fixture();
    assert_eq!(
        idx.resolve("assets/diagram.png"),
        Some("assets/diagram.png")
    );
    // Including by bare name, from anywhere in the vault.
    assert_eq!(idx.resolve("diagram.png"), Some("assets/diagram.png"));
}

/// An extension nothing can render is still not a reference. Obsidian is
/// broader here — it treats any relative markdown link as one — but a target
/// the reading view cannot display earns no place in the link graph.
#[test]
fn diverges_markdown_links_to_unrenderable_files_are_not_harvested() {
    assert!(!markdown_link::is_vault_link_url("archive/backup.zip"));
    assert!(!markdown_link::is_vault_link_url("README"));
    assert!(markdown_link::is_vault_link_url("assets/diagram.png"));
    assert!(markdown_link::is_vault_link_url("notes/x.md"));
    // The `.md` rule keeps its pinned case-sensitivity; the attachment rule
    // does not inherit it.
    assert!(!markdown_link::is_vault_link_url("x.MD"));
    assert!(markdown_link::is_vault_link_url("assets/DIAGRAM.PNG"));
    // A dotfile carries no extension, and neither does a trailing dot.
    assert!(!markdown_link::is_vault_link_url(".png"));
    assert!(!markdown_link::is_vault_link_url("assets/trailing."));
}

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

/// Obsidian's `FrontmatterLinkCache` carries the full YAML key path, so a link
/// nested inside a mapping is addressable. `frontmatter_links` (src/lib.rs:224)
/// labels everything with the TOP-LEVEL key only.
#[test]
fn diverges_nested_frontmatter_links_report_only_the_top_level_key() {
    let fm = note_frontmatter("frontmatter/hazards.md");
    let nested: Vec<_> = markdown_link::frontmatter_links(&fm)
        .into_iter()
        .filter(|l| l.field.as_deref() == Some("meta"))
        .collect();
    assert_eq!(nested.len(), 2);
    assert_eq!(nested[0].target, "glossary/terms/unique-term");
    assert_eq!(nested[1].target, "snippet");
    // Obsidian: keys "meta.rel" and "meta.deeper.rel". Two levels of nesting
    // collapse to the same label here, so the second is unaddressable.
    assert_eq!(nested[0].field, nested[1].field);
}

/// The four YAML shapes Obsidian's `yaml@2` serialiser drops or rewrites on
/// any write, all in one note, all carrying wikilinks. Harvesting must not care
/// which shape a link arrived in — the whole point of frontmatter links is that
/// a rename can find them.
#[test]
fn agrees_frontmatter_links_are_found_in_every_shape_obsidian_rewrites() {
    let raw = read_note("frontmatter/hazards.md");
    let ls = frontmatter_lossless::split_lenient(&raw).expect("hazards.md has frontmatter");
    let yaml = ls.yaml;
    // A YAML comment (dropped by Obsidian), a flow list (rebuilt as a block
    // list), single-quoted scalars (requoted), and a nested mapping (the one
    // shape that survives byte-identically).
    assert!(yaml.starts_with("# A YAML comment"));
    assert!(yaml.contains("related: ['[[glossary/plugin]]', '[[note]]']"));
    assert!(yaml.contains("single: '[[capabilities/plugin]]'"));
    assert!(yaml.contains("  deeper:\n    rel: '[[snippet]]'"));

    let fm = note_frontmatter("frontmatter/hazards.md");
    let links = markdown_link::frontmatter_links(&fm);
    assert_eq!(
        links
            .iter()
            .map(|l| (l.field.as_deref().unwrap(), l.target.as_str(), l.kind))
            .collect::<Vec<_>>(),
        vec![
            ("related", "glossary/plugin", LinkKind::Frontmatter),
            ("related", "note", LinkKind::Frontmatter),
            ("single", "capabilities/plugin", LinkKind::Frontmatter),
            ("meta", "glossary/terms/unique-term", LinkKind::Frontmatter),
            ("meta", "snippet", LinkKind::Frontmatter),
        ]
    );

    // Every one of them names a real file, so a rename would have to rewrite
    // all five. Note that the flow list reaches the glossary side of the
    // collision by full path, which is the cure the research recommends.
    let idx = fixture();
    for l in &links {
        assert!(idx.resolve(&l.target).is_some(), "{}", l.target);
    }
    assert_eq!(idx.resolve("glossary/plugin"), Some("glossary/plugin.md"));
    assert_eq!(
        idx.resolve("capabilities/plugin"),
        Some("capabilities/plugin.md")
    );
    // Obsidian resolves all five identically. It would not, however, publish
    // them: frontmatter links are typed fields, found for rename, never
    // flattened into prose.
}

// ---------------------------------------------------------------------------
// Outright bug — fixed
// ---------------------------------------------------------------------------

/// FIXED: `LinkIndex::build` used to slice the last three BYTES of every
/// path to test for a `.md` extension, with no char-boundary check, so any
/// extension-less path whose final three bytes straddle a character panicked
/// with "byte index N is not a char boundary" — aborting the whole index build.
///
/// It triggered on any path ending in two 2-byte characters (Cyrillic, Greek,
/// Hebrew, Arabic) or one 4-byte character (emoji, most CJK extensions) with no
/// ASCII extension after it. `build` no longer does extension arithmetic at all;
/// the only `.md` strip left is `strip_md_ext`, which guards the slice with
/// `is_char_boundary` and whose doc comment explains exactly this hazard.
///
/// The fixture carries both shapes as real, extensionless files, so building
/// the index at all is the regression test — every other test in this file
/// depends on it not panicking.
#[test]
fn an_extensionless_non_ascii_path_indexes_without_panicking() {
    let idx = fixture();

    // "Привет" is six 2-byte characters: byte 9 lands inside the fifth.
    let cyrillic = "\u{41f}\u{440}\u{438}\u{432}\u{435}\u{442}";
    assert_eq!(cyrillic.len(), 12);
    assert!(!cyrillic.is_char_boundary(cyrillic.len() - 3));
    assert_eq!(
        idx.resolve("\u{43f}\u{440}\u{438}\u{432}\u{435}\u{442}"), // lowercased
        Some("unicode/\u{41f}\u{440}\u{438}\u{432}\u{435}\u{442}")
    );

    // Same for a 4-byte character.
    assert!(!"a\u{1f4dd}".is_char_boundary("a\u{1f4dd}".len() - 3));
    assert_eq!(idx.resolve("a\u{1f4dd}"), Some("unicode/a\u{1f4dd}"));
}
