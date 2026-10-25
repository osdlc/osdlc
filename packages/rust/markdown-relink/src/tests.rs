//! The layer's centre of gravity: fixture vaults, one per link shape.
//!
//! Every test here is a `tempfile::tempdir()` and no host. The shapes are the
//! ones a real note vault contains — bare names, pathed names, aliases,
//! heading anchors, block refs, embeds, markdown links (percent-encoded and
//! not), frontmatter references, CRLF files, spaces and non-ASCII in filenames
//! — because a rename that is correct for `[[Alpha]]` and wrong for
//! `![[Projects/Alpha#^goals-block]]` is a rename that quietly eats somebody's
//! note.

use std::path::Path;

use crate::{DiagnosticCode, FileEtag, RenamePlan, VaultFacts, apply, plan};

// ── Harness ─────────────────────────────────────────────────────────────────

struct Fixture {
    dir: tempfile::TempDir,
}

impl Fixture {
    fn new(files: &[(&str, &str)]) -> Fixture {
        let dir = tempfile::tempdir().unwrap();
        for (rel, content) in files {
            let path = dir.path().join(rel);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(&path, content).unwrap();
        }
        Fixture { dir }
    }

    fn path(&self) -> &Path {
        self.dir.path()
    }

    /// A snapshot taken FRESH every time, which is what a caller holding warm
    /// caches is responsible for arranging and what makes these tests
    /// independent of any cache's freshness rule.
    fn facts(&self) -> VaultFacts {
        VaultFacts::scan(self.path())
    }

    fn plan(&self, from: &str, to: &str) -> RenamePlan {
        plan::plan(self.path(), &self.facts(), from, to).expect("plan")
    }

    fn apply(&self, p: &RenamePlan) -> crate::RenameResult {
        apply::execute(self.path(), &self.facts(), &p.from, &p.to, None, &p.expect)
            .expect("execute")
    }

    /// Plan, apply, and assert **dry-run parity**: the bytes on disk are
    /// exactly the bytes the plan predicted, file by file.
    fn rename(&self, from: &str, to: &str) -> RenamePlan {
        let plan = self.plan(from, to);
        let predicted: Vec<(String, Vec<u8>)> = plan
            .files
            .iter()
            .filter(|f| !f.edits.is_empty())
            .map(|f| {
                let before = std::fs::read(self.path().join(&f.path)).unwrap();
                let mut after = before.clone();
                for edit in f.edits.iter().rev() {
                    after.splice(
                        edit.offset..edit.offset + edit.delete_count,
                        edit.insert.bytes(),
                    );
                }
                // The predicted path: the subject's own edits land at its NEW
                // home once the move completes.
                let path = if f.path == plan.from {
                    plan.to.clone()
                } else {
                    f.path.clone()
                };
                (path, after)
            })
            .collect();

        let result = self.apply(&plan);
        assert!(result.ok, "apply refused: {:?}", result.conflict);
        assert!(result.skipped.is_empty(), "skipped {:?}", result.skipped);

        for (path, bytes) in predicted {
            assert_eq!(
                std::fs::read(self.path().join(&path)).unwrap(),
                bytes,
                "dry-run parity broke for {path}"
            );
        }
        plan
    }

    fn read(&self, rel: &str) -> String {
        std::fs::read_to_string(self.path().join(rel)).unwrap()
    }

    fn exists(&self, rel: &str) -> bool {
        self.path().join(rel).exists()
    }

    fn plan_bundle(&self, from: &str, to: &str) -> RenamePlan {
        crate::bundle::plan_bundle(self.path(), &self.facts(), from, to).expect("plan_bundle")
    }

    fn apply_bundle(&self, p: &RenamePlan) -> crate::RenameResult {
        crate::bundle::execute_bundle(self.path(), &self.facts(), &p.from, &p.to, None, &p.expect)
            .expect("execute_bundle")
    }
}

fn codes(plan: &RenamePlan) -> Vec<&'static str> {
    let mut out: Vec<&'static str> = plan.diagnostics.iter().map(|d| d.code.as_str()).collect();
    out.sort_unstable();
    out.dedup();
    out
}

// ── The link shapes ─────────────────────────────────────────────────────────

/// One note carrying every shape at once, so a rewrite that gets one right and
/// another wrong cannot pass by testing them separately.
const ALL_SHAPES: &str = "\
A bare link: [[Alpha]].
A pathed link: [[Projects/Alpha]].
An alias: [[Alpha|the alpha project]].
A pathed alias: [[Projects/Alpha|the alpha project]].
A heading: [[Alpha#Goals]].
A block: [[Alpha#^goals-block]].
An embed: ![[Alpha]].
An embedded heading: ![[Projects/Alpha#Goals]].
A markdown link: [alpha](Projects/Alpha.md).
An encoded markdown link: [alpha](Projects%2FAlpha.md).

```
Inside a fence: [[Alpha]] must not move.
```

And inline `[[Alpha]]` code must not move either.
";

#[test]
fn every_shape_is_repointed_and_only_the_target_changes() {
    let f = Fixture::new(&[("Projects/Alpha.md", "# Alpha\n"), ("Home.md", ALL_SHAPES)]);
    f.rename("Projects/Alpha.md", "Projects/Beta.md");
    let home = f.read("Home.md");

    // Bare names stay bare, pathed names stay pathed — the author's own level
    // of qualification survives the rewrite.
    assert!(home.contains("A bare link: [[Beta]]."), "{home}");
    assert!(home.contains("A pathed link: [[Projects/Beta]]."), "{home}");
    // Aliases, anchors, block refs and the embed marker ride along untouched.
    assert!(home.contains("[[Beta|the alpha project]]"), "{home}");
    assert!(
        home.contains("[[Projects/Beta|the alpha project]]"),
        "{home}"
    );
    assert!(home.contains("[[Beta#Goals]]"), "{home}");
    assert!(home.contains("[[Beta#^goals-block]]"), "{home}");
    assert!(home.contains("An embed: ![[Beta]]."), "{home}");
    assert!(home.contains("![[Projects/Beta#Goals]]"), "{home}");
    // A markdown link stays a markdown link, label intact.
    assert!(
        home.contains("A markdown link: [alpha](Projects/Beta.md)."),
        "{home}"
    );
    // …and one whose URL is percent-encoded on the way in is DECODED to resolve
    // and re-encoded to write. `%2F` is the separator, so this line only
    // rewrites at all if the decoder ran; the destination needs no encoding, so
    // the output is the plain path.
    assert!(
        home.contains("An encoded markdown link: [alpha](Projects/Beta.md)."),
        "{home}"
    );
    // Code is not link text, here as everywhere else.
    assert!(
        home.contains("Inside a fence: [[Alpha]] must not move."),
        "{home}"
    );
    assert!(home.contains("inline `[[Alpha]]` code"), "{home}");

    assert!(f.exists("Projects/Beta.md"));
    assert!(!f.exists("Projects/Alpha.md"));
}

#[test]
fn a_percent_encoded_markdown_link_is_decoded_to_resolve_and_re_encoded_to_write() {
    let f = Fixture::new(&[
        ("Projects/Alpha One.md", "# Alpha One\n"),
        (
            "Home.md",
            "See [the notes](Projects/Alpha%20One.md) for details.\n",
        ),
    ]);
    f.rename("Projects/Alpha One.md", "Archive/Beta Two.md");
    assert_eq!(
        f.read("Home.md"),
        "See [the notes](Archive/Beta%20Two.md) for details.\n"
    );
}

#[test]
fn an_angle_bracketed_markdown_url_keeps_its_brackets() {
    let f = Fixture::new(&[
        ("Alpha.md", "# Alpha\n"),
        ("Home.md", "See [a](<Alpha.md>).\n"),
    ]);
    f.rename("Alpha.md", "Beta.md");
    assert_eq!(f.read("Home.md"), "See [a](<Beta.md>).\n");
}

#[test]
fn a_rename_keeps_the_escape_before_a_table_cell_alias_pipe() {
    let f = Fixture::new(&[
        ("Alpha.md", "# Alpha\n"),
        (
            "Home.md",
            "| link | plain |\n|---|---|\n| [[Alpha\\|the alpha]] | [[Alpha|the alpha]] |\n| ![[Alpha#Goals\\|g]] | [[Alpha]] |\n",
        ),
    ]);
    f.rename("Alpha.md", "Beta.md");
    assert_eq!(
        f.read("Home.md"),
        "| link | plain |\n|---|---|\n| [[Beta\\|the alpha]] | [[Beta|the alpha]] |\n| ![[Beta#Goals\\|g]] | [[Beta]] |\n"
    );
}

// ── The no-edit case ────────────────────────────────────────────────────────

#[test]
fn a_pure_folder_move_that_keeps_the_basename_edits_nothing() {
    let f = Fixture::new(&[
        ("Projects/Alpha.md", "# Alpha\n"),
        ("Home.md", "Bare: [[Alpha]] and aliased [[Alpha|it]].\n"),
        ("Daily/Today.md", "Also ![[Alpha]].\n"),
    ]);
    let before_home = f.read("Home.md");
    let before_daily = f.read("Daily/Today.md");

    let plan = f.rename("Projects/Alpha.md", "Archive/2026/Alpha.md");

    // The whole point: zero edits, because `[[Alpha]]` still names the note.
    assert_eq!(plan.edit_count(), 0, "{:?}", plan.files);
    assert_eq!(plan.edited_file_count(), 0);
    assert_eq!(f.read("Home.md"), before_home);
    assert_eq!(f.read("Daily/Today.md"), before_daily);
    assert!(f.exists("Archive/2026/Alpha.md"));

    // …and the links still resolve afterwards, which is the property the
    // no-edit decision is actually claiming.
    let probe = f.plan("Archive/2026/Alpha.md", "Archive/2026/Gamma.md");
    assert_eq!(probe.edit_count(), 3, "{:?}", probe.files);
}

#[test]
fn a_pathed_link_is_rewritten_by_a_folder_move_even_though_the_basename_is_stable() {
    // The case a "does it still resolve" check with the basename fallback gets
    // wrong: `[[Projects/Alpha]]` names a folder the note has left.
    let f = Fixture::new(&[
        ("Projects/Alpha.md", "# Alpha\n"),
        ("Home.md", "See [[Projects/Alpha]].\n"),
    ]);
    f.rename("Projects/Alpha.md", "Archive/Alpha.md");
    assert_eq!(f.read("Home.md"), "See [[Archive/Alpha]].\n");
}

// ── Ambiguity ───────────────────────────────────────────────────────────────

#[test]
fn a_move_that_creates_ambiguity_qualifies_and_says_so() {
    let f = Fixture::new(&[
        ("Projects/Alpha.md", "# Alpha\n"),
        ("Archive/Notes.md", "# an unrelated note\n"),
        ("Other/Alpha.md", "# a different Alpha\n"),
        ("Home.md", "See [[Projects/Alpha]].\n"),
    ]);
    // Moving to `Archive/` leaves two `Alpha.md` in the vault, so a bare
    // `[[Alpha]]` would be ambiguous — the rewrite must qualify.
    let plan = f.rename("Projects/Alpha.md", "Archive/Alpha.md");
    assert_eq!(f.read("Home.md"), "See [[Archive/Alpha]].\n");
    assert!(
        codes(&plan).contains(&"ambiguous_link"),
        "{:?}",
        plan.diagnostics
    );
}

#[test]
fn an_already_ambiguous_bare_link_is_qualified_rather_than_left_pointing_elsewhere() {
    // `Alpha.md` at the root wins the bare key today (shallowest path), so
    // `[[Alpha]]` in Home means the root one. Renaming the root one must not
    // leave `[[Alpha]]` silently pointing at the deep one.
    let f = Fixture::new(&[
        ("Alpha.md", "# root alpha\n"),
        ("Deep/Nested/Alpha.md", "# deep alpha\n"),
        ("Home.md", "See [[Alpha]].\n"),
    ]);
    let plan = f.rename("Alpha.md", "Alpha Renamed.md");
    assert_eq!(f.read("Home.md"), "See [[Alpha Renamed]].\n");
    assert!(plan.ok());
}

// ── Refusals ────────────────────────────────────────────────────────────────

#[test]
fn a_collision_is_refused_before_anything_is_read() {
    let f = Fixture::new(&[("Alpha.md", "a\n"), ("Beta.md", "b\n")]);
    let plan = f.plan("Alpha.md", "Beta.md");
    assert!(!plan.ok());
    assert!(plan.conflict.unwrap().contains("already exists"));
    assert_eq!(f.read("Alpha.md"), "a\n");
    assert_eq!(f.read("Beta.md"), "b\n");
}

#[test]
fn the_refusals_each_name_their_reason() {
    let f = Fixture::new(&[
        ("Alpha.md", "a\n"),
        ("_system/config.md", "c\n"),
        (".trash/gone.md", "g\n"),
    ]);
    let cases = [
        ("Alpha.md", "Alpha.md", "same path"),
        ("_system/config.md", "Alpha 2.md", "_system/"),
        ("Alpha.md", "_system/config 2.md", "_system/"),
        // The mis-cased spellings, in BOTH directions: on macOS or Windows,
        // where `_System/x.md` and `_system/x.md` are one file, a rename
        // typed with a capital S must not walk past the refusal —
        // unvalidated prose into the contract-validated directory, or a
        // scheduled task quietly carried out of it. Mirrors
        // `markdown_vault_fs::path`'s
        // `the_system_prefix_is_matched_case_insensitively`, the one
        // predicate both guards use.
        ("_System/config.md", "Alpha 2.md", "_system/"),
        ("Alpha.md", "_System/scheduled_tasks/Alpha.md", "_system/"),
        ("Alpha.md", "_SYSTEM/config 2.md", "_system/"),
        (".trash/gone.md", "Alpha 2.md", "hidden directory"),
        ("Alpha.md", "Alpha.txt", "not a markdown note"),
        ("Nothing.md", "Something.md", "no note at"),
    ];
    for (from, to, needle) in cases {
        let plan = f.plan(from, to);
        let conflict = plan.conflict.unwrap_or_default();
        assert!(
            conflict.contains(needle),
            "{from} -> {to}: expected {needle:?}, got {conflict:?}"
        );
    }
}

#[test]
fn a_case_only_rename_is_allowed_and_needs_no_link_edits() {
    let f = Fixture::new(&[
        ("Projects/alpha.md", "# alpha\n"),
        ("Home.md", "See [[alpha]] and [[Projects/alpha]].\n"),
    ]);
    let before = f.read("Home.md");
    let plan = f.plan("Projects/alpha.md", "Projects/Alpha.md");
    assert!(plan.ok(), "{:?}", plan.conflict);
    assert!(
        codes(&plan).contains(&"case_only_rename"),
        "{:?}",
        plan.diagnostics
    );
    // Resolution is case-insensitive, so every inbound link already names the
    // new file. Rewriting them would churn the vault for a cosmetic change.
    assert_eq!(plan.edit_count(), 0, "{:?}", plan.files);

    let result = f.apply(&plan);
    assert!(result.ok, "{:?}", result.conflict);
    assert_eq!(f.read("Home.md"), before);
    assert_eq!(f.read("Projects/Alpha.md"), "# alpha\n");
}

// ── Diagnostics ─────────────────────────────────────────────────────────────

#[test]
fn a_link_that_spells_the_name_but_means_another_note_is_reported_and_left_alone() {
    // Two `Alpha.md`. The shallow one wins the bare key, so `[[Alpha]]` in
    // Home means the ROOT note — renaming the deep one must not touch it, and
    // must say why.
    let f = Fixture::new(&[
        ("Alpha.md", "# the root alpha\n"),
        ("Deep/Alpha.md", "# the deep alpha\n"),
        ("Home.md", "Bare: [[Alpha]]. Deep: [[Deep/Alpha]].\n"),
    ]);
    let plan = f.plan("Deep/Alpha.md", "Deep/Gamma.md");
    assert!(
        codes(&plan).contains(&"pre_broken_link"),
        "{:?}",
        plan.diagnostics
    );
    assert!(
        plan.diagnostics
            .iter()
            .any(|d| d.code == DiagnosticCode::PreBrokenLink && d.detail.contains("Alpha.md")),
        "{:?}",
        plan.diagnostics
    );
    // Exactly one edit: the pathed link, which really did name the deep note.
    assert_eq!(plan.edit_count(), 1, "{:?}", plan.files);
    f.apply(&plan);
    assert_eq!(
        f.read("Home.md"),
        "Bare: [[Alpha]]. Deep: [[Deep/Gamma]].\n"
    );
}

#[test]
fn a_link_that_resolves_nowhere_is_never_adopted_by_the_rename() {
    // `[[Alpha Two]]` names nothing before the rename and must name nothing
    // after it — a rename does not get to repair a link by accident.
    let f = Fixture::new(&[
        ("Projects/Alpha.md", "# Alpha\n"),
        (
            "Home.md",
            "Good: [[Projects/Alpha]]. Broken: [[Alpha Two]].\n",
        ),
    ]);
    let plan = f.rename("Projects/Alpha.md", "Projects/Alpha Two.md");
    assert_eq!(plan.edit_count(), 1, "{:?}", plan.files);
    assert_eq!(
        f.read("Home.md"),
        "Good: [[Projects/Alpha Two]]. Broken: [[Alpha Two]].\n"
    );
}

#[test]
fn a_frontmatter_reference_is_diagnosed_rather_than_rewritten() {
    let f = Fixture::new(&[
        ("Projects/Alpha.md", "# Alpha\n"),
        (
            "Home.md",
            "---\nrelated: '[[Projects/Alpha]]'\n---\nBody link: [[Alpha]].\n",
        ),
    ]);
    let plan = f.plan("Projects/Alpha.md", "Projects/Beta.md");
    assert!(
        codes(&plan).contains(&"frontmatter_link_untouched"),
        "{:?}",
        plan.diagnostics
    );
    // Exactly one edit — the body link. The frontmatter value is untouched.
    assert_eq!(plan.edit_count(), 1, "{:?}", plan.files);
    f.apply(&plan);
    let home = f.read("Home.md");
    assert!(home.contains("related: '[[Projects/Alpha]]'"), "{home}");
    assert!(home.contains("Body link: [[Beta]]."), "{home}");
}

#[test]
fn a_candidate_that_became_unreadable_is_disclosed_rather_than_dropped() {
    // The snapshot is a filter taken a moment ago; the file is the truth read
    // now. When the two disagree the plan must say so — a note that links here
    // and is not in the plan will still name the old path afterwards, and a
    // preview whose whole job is disclosure cannot drop it in silence.
    let f = Fixture::new(&[("Alpha.md", "# Alpha\n"), ("One.md", "See [[Alpha]].\n")]);
    let facts = f.facts();
    std::fs::remove_file(f.path().join("One.md")).unwrap();

    let plan = plan::plan(f.path(), &facts, "Alpha.md", "Beta.md").expect("plan");
    assert!(
        codes(&plan).contains(&"unreadable_candidate"),
        "{:?}",
        plan.diagnostics
    );
    assert!(plan.files.iter().all(|file| file.path != "One.md"));
    // Absent from `expect` too, which is what makes `execute` skip rather than
    // guess if the file comes back.
    assert!(plan.expect.iter().all(|e| e.path != "One.md"));
}

#[test]
fn a_candidate_that_stopped_being_utf8_is_diagnosed_rather_than_spliced() {
    let f = Fixture::new(&[("Alpha.md", "# Alpha\n"), ("One.md", "See [[Alpha]].\n")]);
    let facts = f.facts();
    // The file the snapshot read is not the file the planner reads. A lossy
    // decode would widen the stray byte into a three-byte U+FFFD, and every
    // offset computed from the widened string would splice three bytes further
    // along than it meant to.
    let mut bytes = b"See [[Alpha]]. ".to_vec();
    bytes.push(0x80);
    bytes.push(b'\n');
    std::fs::write(f.path().join("One.md"), &bytes).unwrap();

    let plan = plan::plan(f.path(), &facts, "Alpha.md", "Beta.md").expect("plan");
    assert!(
        codes(&plan).contains(&"invalid_utf8_candidate"),
        "{:?}",
        plan.diagnostics
    );
    assert!(plan.files.iter().all(|file| file.path != "One.md"));

    let result = apply::execute(f.path(), &facts, "Alpha.md", "Beta.md", None, &plan.expect)
        .expect("execute");
    assert!(result.ok, "{:?}", result.conflict);
    assert_eq!(
        std::fs::read(f.path().join("One.md")).unwrap(),
        bytes,
        "not one byte of a file the planner could not index"
    );
}

#[test]
fn a_note_that_links_to_itself_is_rewritten_and_reported() {
    let f = Fixture::new(&[(
        "Projects/Alpha.md",
        "# Alpha\n\nSee [[Alpha]] — that is this note.\n",
    )]);
    let plan = f.rename("Projects/Alpha.md", "Projects/Beta.md");
    assert!(
        codes(&plan).contains(&"self_link"),
        "{:?}",
        plan.diagnostics
    );
    assert!(
        f.read("Projects/Beta.md").contains("See [[Beta]]"),
        "{}",
        f.read("Projects/Beta.md")
    );
}

// ── Framing and encodings ───────────────────────────────────────────────────

#[test]
fn a_crlf_note_stays_entirely_crlf() {
    let f = Fixture::new(&[
        ("Alpha.md", "# Alpha\r\n"),
        (
            "Home.md",
            "---\r\ntitle: Home\r\n---\r\nSee [[Alpha]].\r\nAnd again [[Alpha|it]].\r\n",
        ),
    ]);
    f.rename("Alpha.md", "Beta.md");
    let home = f.read("Home.md");
    assert_eq!(
        home,
        "---\r\ntitle: Home\r\n---\r\nSee [[Beta]].\r\nAnd again [[Beta|it]].\r\n"
    );
    assert!(!home.contains('\n') || home.matches("\r\n").count() == home.matches('\n').count());
}

#[test]
fn frontmatter_offsets_are_file_relative_not_body_relative() {
    // The bug this pins: a body-relative offset spliced into the file writes
    // into the middle of the YAML block by exactly its length.
    let f = Fixture::new(&[
        ("Alpha.md", "# Alpha\n"),
        (
            "Home.md",
            "---\ntitle: A note with a long frontmatter block\ntags: [one, two, three]\n---\nSee [[Alpha]].\n",
        ),
    ]);
    f.rename("Alpha.md", "Beta.md");
    assert_eq!(
        f.read("Home.md"),
        "---\ntitle: A note with a long frontmatter block\ntags: [one, two, three]\n---\nSee [[Beta]].\n"
    );
}

#[test]
fn spaces_ampersands_and_non_ascii_survive_the_round_trip() {
    let f = Fixture::new(&[
        ("Special Chars & Spaces.md", "# Special\n"),
        ("Заметки/Привет.md", "# Привет\n"),
        (
            "Home.md",
            "One: [[Special Chars & Spaces]].\nTwo: [[Привет]].\nThree: [x](Special%20Chars%20&%20Spaces.md).\n",
        ),
    ]);
    f.rename(
        "Special Chars & Spaces.md",
        "Archive/Even More Special & Odd.md",
    );
    let home = f.read("Home.md");
    assert!(home.contains("One: [[Even More Special & Odd]]."), "{home}");
    assert!(home.contains("Two: [[Привет]]."), "{home}");
    assert!(
        home.contains("Three: [x](Archive/Even%20More%20Special%20&%20Odd.md)."),
        "{home}"
    );

    // And the same for a non-ASCII subject.
    let plan = f.plan("Заметки/Привет.md", "Заметки/Пока.md");
    assert_eq!(plan.edit_count(), 1, "{:?}", plan.files);
    f.apply(&plan);
    assert!(f.read("Home.md").contains("Two: [[Пока]]."));
}

// ── The apply pass ──────────────────────────────────────────────────────────

#[test]
fn a_linking_note_that_drifted_is_skipped_and_named() {
    let f = Fixture::new(&[
        ("Alpha.md", "# Alpha\n"),
        ("One.md", "See [[Alpha]].\n"),
        ("Two.md", "Also [[Alpha]].\n"),
    ]);
    let plan = f.plan("Alpha.md", "Beta.md");
    assert_eq!(plan.edited_file_count(), 2);

    // Somebody edits One.md between the preview and the apply.
    std::fs::write(
        f.path().join("One.md"),
        "See [[Alpha]]. Edited elsewhere.\n",
    )
    .unwrap();

    let result = f.apply(&plan);
    assert!(result.ok);
    assert_eq!(result.edited, vec!["Two.md".to_string()]);
    assert_eq!(result.skipped.len(), 1);
    assert_eq!(result.skipped[0].path, "One.md");
    assert_eq!(result.skipped[0].reason, "drifted");
    // The drifted note keeps BOTH the other edit and its old link — nothing was
    // half-written into it.
    assert_eq!(f.read("One.md"), "See [[Alpha]]. Edited elsewhere.\n");
    assert_eq!(f.read("Two.md"), "Also [[Beta]].\n");
    assert!(f.exists("Beta.md"));
}

#[test]
fn a_file_the_preview_never_showed_is_skipped_rather_than_written() {
    let f = Fixture::new(&[("Alpha.md", "# Alpha\n"), ("One.md", "See [[Alpha]].\n")]);
    let plan = f.plan("Alpha.md", "Beta.md");

    // A note that links to the subject appears after the preview.
    std::fs::write(f.path().join("Two.md"), "Late: [[Alpha]].\n").unwrap();

    let result = f.apply(&plan);
    assert!(result.ok);
    assert_eq!(result.edited, vec!["One.md".to_string()]);
    assert_eq!(
        result.skipped,
        vec![crate::Skip {
            path: "Two.md".to_string(),
            reason: "not_previewed".to_string(),
        }]
    );
}

#[test]
fn a_drifted_subject_aborts_everything() {
    let f = Fixture::new(&[("Alpha.md", "# Alpha\n"), ("One.md", "See [[Alpha]].\n")]);
    let plan = f.plan("Alpha.md", "Beta.md");
    let etag = plan
        .expect
        .iter()
        .find(|e| e.path == "Alpha.md")
        .unwrap()
        .etag
        .clone();

    std::fs::write(f.path().join("Alpha.md"), "# Alpha, edited\n").unwrap();

    let result = apply::execute(
        f.path(),
        &f.facts(),
        "Alpha.md",
        "Beta.md",
        Some(&etag),
        &plan.expect,
    )
    .unwrap();
    assert!(!result.ok);
    assert!(result.conflict.unwrap().contains("changed on disk"));
    assert!(!result.renamed);
    // Nothing was written, not even the link that would have been fine.
    assert_eq!(f.read("One.md"), "See [[Alpha]].\n");
    assert!(f.exists("Alpha.md"));
}

#[test]
fn a_partial_apply_completes_the_move_and_leaves_the_skipped_link_for_a_human() {
    // The recovery story, stated as the code actually behaves it. A skip does
    // NOT hold the rename back and re-running is NOT the repair: the subject
    // moves, the skipped note keeps a link naming a path nothing occupies, and
    // the only thing that names it is the reported skip.
    let f = Fixture::new(&[
        ("Alpha.md", "# Alpha\n"),
        ("One.md", "See [[Alpha]].\n"),
        ("Two.md", "Also [[Alpha]].\n"),
    ]);
    let plan = f.plan("Alpha.md", "Beta.md");
    // Somebody touches Two.md between the preview and the apply, so it drifts.
    std::fs::write(f.path().join("Two.md"), "Also [[Alpha]]. Touched.\n").unwrap();
    let first = f.apply(&plan);
    assert!(first.ok);
    assert_eq!(first.edited, vec!["One.md".to_string()]);
    assert_eq!(first.skipped.len(), 1);
    assert_eq!(first.skipped[0].path, "Two.md");
    // The rename completed anyway.
    assert!(first.renamed);
    assert!(f.exists("Beta.md"));
    assert!(!f.exists("Alpha.md"));

    // So the skipped note now holds a broken link — that is the state the
    // caller has to tell the user about, and it is why the skip is named
    // rather than counted.
    assert_eq!(f.read("Two.md"), "Also [[Alpha]]. Touched.\n");

    // And re-running the same rename is REFUSED, because `from` is gone. There
    // is no second pass that finishes the job; the repair is the user's.
    let rerun = f.plan("Alpha.md", "Beta.md");
    assert!(!rerun.ok());
    assert!(rerun.conflict.unwrap().contains("no note at"));
}

// ── The destination reservation ─────────────────────────────────────────────

#[test]
fn a_reservation_is_exclusive_and_leaves_nothing_behind() {
    // The mechanism on its own: the window it closes is inside one `execute`
    // call and cannot be opened from a test, so the claim is exercised here.
    let f = Fixture::new(&[]);
    let path = f.path().join("Claimed.md");
    {
        let _held = apply::Reservation::claim(&path).expect("the first claim wins");
        assert!(
            path.exists(),
            "the claim is a real file — that is what makes it atomic"
        );
        assert!(
            apply::Reservation::claim(&path).is_err(),
            "a second claim on the same name must lose"
        );
    }
    assert!(
        !path.exists(),
        "a claim that was never fulfilled removes its own placeholder"
    );
}

#[test]
fn a_destination_that_appeared_after_the_preview_is_refused_with_nothing_written() {
    let f = Fixture::new(&[("Alpha.md", "# Alpha\n"), ("One.md", "See [[Alpha]].\n")]);
    let plan = f.plan("Alpha.md", "Beta.md");

    // An editor, open on the same vault, takes the name first.
    std::fs::write(f.path().join("Beta.md"), "# somebody else's Beta\n").unwrap();

    let result = f.apply(&plan);
    assert!(!result.ok, "{result:?}");
    assert!(result.conflict.unwrap().contains("Beta.md"));
    assert!(!result.renamed);
    // Nothing was written: not the link edit, and above all not over the file
    // that got there first.
    assert_eq!(f.read("One.md"), "See [[Alpha]].\n");
    assert_eq!(f.read("Beta.md"), "# somebody else's Beta\n");
    assert!(f.exists("Alpha.md"));
}

#[test]
fn a_successful_rename_leaves_the_note_at_the_destination_not_the_placeholder() {
    // The reservation writes an empty file at `to`; the rename must land ON it,
    // not beside it. `rename` already asserts dry-run parity for the edited
    // notes — this asserts the subject's own bytes survived the claim.
    let f = Fixture::new(&[
        ("Projects/Alpha.md", "---\ntitle: Alpha\n---\n# Alpha\n"),
        ("Home.md", "See [[Alpha]].\n"),
    ]);
    f.rename("Projects/Alpha.md", "Archive/Beta.md");
    assert_eq!(
        f.read("Archive/Beta.md"),
        "---\ntitle: Alpha\n---\n# Alpha\n"
    );
    assert_eq!(f.read("Home.md"), "See [[Beta]].\n");
}

#[cfg(unix)]
#[test]
fn a_rename_that_cannot_complete_leaves_no_placeholder_behind() {
    use std::os::unix::fs::PermissionsExt;

    let f = Fixture::new(&[
        ("Locked/Alpha.md", "# Alpha\n"),
        ("Home.md", "See [[Alpha]].\n"),
    ]);
    let plan = f.plan("Locked/Alpha.md", "Alpha Moved.md");

    // The one way to fail the final `fs::rename` without disturbing any path
    // the plan depends on: take write permission off the directory the subject
    // has to leave. Everything the plan reads stays readable.
    let locked = f.path().join("Locked");
    let original = std::fs::metadata(&locked).unwrap().permissions();
    std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o555)).unwrap();
    if std::fs::write(locked.join(".probe"), b"x").is_ok() {
        // Running as root: permissions do not apply, so there is nothing here
        // to test.
        let _ = std::fs::remove_file(locked.join(".probe"));
        std::fs::set_permissions(&locked, original).unwrap();
        return;
    }

    let outcome = apply::execute(
        f.path(),
        &f.facts(),
        &plan.from,
        &plan.to,
        None,
        &plan.expect,
    );
    std::fs::set_permissions(&locked, original).unwrap();

    assert!(outcome.is_err(), "the rename could not happen: {outcome:?}");
    assert!(
        !f.exists("Alpha Moved.md"),
        "the reservation must not outlive the attempt it was taken for"
    );
    assert!(f.exists("Locked/Alpha.md"));
}

#[test]
fn the_subject_is_always_in_the_compare_and_swap_set() {
    let f = Fixture::new(&[("Alpha.md", "# Alpha, nobody links here\n")]);
    let plan = f.plan("Alpha.md", "Beta.md");
    assert!(plan.files.is_empty());
    assert_eq!(plan.expect.len(), 1);
    assert_eq!(plan.expect[0].path, "Alpha.md");
    assert!(!plan.expect[0].etag.is_empty());
}

#[test]
fn a_move_into_a_folder_that_does_not_exist_yet_creates_it() {
    let f = Fixture::new(&[("Alpha.md", "# Alpha\n"), ("Home.md", "See [[Alpha]].\n")]);
    f.rename("Alpha.md", "Deep/Nested/New/Alpha Moved.md");
    assert!(f.exists("Deep/Nested/New/Alpha Moved.md"));
    assert_eq!(f.read("Home.md"), "See [[Alpha Moved]].\n");
}

#[test]
fn an_expect_entry_for_an_unrelated_file_changes_nothing() {
    let f = Fixture::new(&[("Alpha.md", "# Alpha\n"), ("One.md", "See [[Alpha]].\n")]);
    let plan = f.plan("Alpha.md", "Beta.md");
    let mut expect = plan.expect.clone();
    expect.push(FileEtag {
        path: "Nonexistent.md".to_string(),
        etag: "deadbeef".to_string(),
    });
    let result =
        apply::execute(f.path(), &f.facts(), "Alpha.md", "Beta.md", None, &expect).unwrap();
    assert!(result.ok);
    assert_eq!(result.edited, vec!["One.md".to_string()]);
    assert!(result.skipped.is_empty());
}

// ── Corpus semantics, on their own ──────────────────────────────────────────

#[test]
fn the_corpus_keys_the_way_link_index_does_and_keeps_every_candidate() {
    let paths: Vec<String> = ["Alpha.md", "Deep/Nested/Alpha.md", "assets/photo.png"]
        .iter()
        .map(|s| s.to_string())
        .collect();
    let corpus = plan::Corpus::build(&paths);

    // Ambiguous, and the winner is the shallow one — `LinkIndex`'s rule.
    match corpus.resolve_strict("alpha") {
        plan::Resolution::Ambiguous(hit) => assert_eq!(hit, "Alpha.md"),
        other => panic!("expected ambiguity, got {other:?}"),
    }
    assert_eq!(
        corpus.resolve_strict("Nested/Alpha"),
        plan::Resolution::Unique("Deep/Nested/Alpha.md".to_string())
    );
    // Attachments are addressed with their extension, as in `LinkIndex`.
    assert_eq!(
        corpus.resolve_strict("photo.png"),
        plan::Resolution::Unique("assets/photo.png".to_string())
    );
    assert_eq!(corpus.resolve_strict("photo"), plan::Resolution::None);

    // Strict has no basename fallback; lenient does.
    assert_eq!(
        corpus.resolve_strict("Made Up/Nested/Alpha"),
        plan::Resolution::None
    );
    assert_eq!(
        corpus.resolve_lenient("Made Up/Alpha", "").as_deref(),
        Some("Alpha.md")
    );

    assert_eq!(corpus.minimum_unambiguous_depth("Deep/Nested/Alpha.md"), 2);
    assert_eq!(
        corpus.shortest_unambiguous("Deep/Nested/Alpha.md"),
        "Nested/Alpha"
    );
}

#[test]
fn the_lenient_fallback_agrees_with_link_index_on_a_doubled_extension() {
    // `[[Projects/Alpha.md.md]]` is the case that catches a double
    // normalisation. `normalize_target` strips ONE `.md`, so the pathed key
    // misses and both resolvers fall back to the basename — and the fallback
    // must look its sub-key up as-is, because `LinkIndex::resolve` indexes
    // `by_key` with it directly. Normalising it a second time strips a second
    // `.md` and turns a miss into a hit the app itself would never make.
    let paths = vec!["Projects/Alpha.md".to_string()];
    let corpus = plan::Corpus::build(&paths);
    let index = markdown_link::LinkIndex::build(&paths);

    assert_eq!(index.resolve("Projects/Alpha.md.md"), None);
    assert_eq!(corpus.resolve_lenient("Projects/Alpha.md.md", ""), None);
    // …and the ordinary pathed-miss fallback still works, in both.
    assert_eq!(index.resolve("Made Up/Alpha"), Some("Projects/Alpha.md"));
    assert_eq!(
        corpus.resolve_lenient("Made Up/Alpha", "").as_deref(),
        Some("Projects/Alpha.md")
    );
}

#[test]
fn a_name_no_suffix_can_disambiguate_is_still_reported_as_ambiguous() {
    // Two paths differing only by case are one key with two candidates, so no
    // suffix — not even the whole path — names either alone.
    // `minimum_unambiguous_depth` has nothing to return but the total, and the
    // form written is ambiguous however qualified it is. The link still goes
    // somewhere and is still worth writing; writing it silently is the only
    // thing worse.
    let paths = vec!["Alpha.md".to_string(), "alpha.md".to_string()];
    let corpus = plan::Corpus::build(&paths);
    assert_eq!(corpus.minimum_unambiguous_depth("alpha.md"), 1);
    assert_eq!(
        corpus.qualified_form("alpha.md", 1),
        ("alpha".to_string(), true)
    );
}

#[test]
fn a_link_that_resolves_only_through_the_basename_fallback_is_rewritten() {
    // `[[Made Up/Alpha]]` names a folder that does not exist, and the app opens
    // `Projects/Alpha.md` for it anyway — `LinkIndex::resolve`'s pathed-miss
    // fallback, which `resolve_lenient` mirrors. A rename that only looked at
    // exact suffixes would leave this link naming a note that has moved.
    let f = Fixture::new(&[
        ("Projects/Alpha.md", "# Alpha\n"),
        ("Home.md", "See [[Made Up/Alpha]].\n"),
    ]);
    f.rename("Projects/Alpha.md", "Projects/Beta.md");
    // Two segments in, two segments out: the author's own qualification level
    // survives even when the folder they wrote was fictional.
    assert_eq!(f.read("Home.md"), "See [[Projects/Beta]].\n");
}

#[test]
fn a_relative_link_follows_only_the_copy_at_its_path() {
    // `../img/A.md` from `notes/` names `img/A.md`, not the same-named
    // `x/A.md` — `LinkIndex::resolve_from`'s relative step, which
    // `resolve_lenient` mirrors.
    let files = [
        ("img/A.md", "# A\n"),
        ("x/A.md", "# A\n"),
        ("notes/N.md", "[a](../img/A.md)\n"),
    ];

    let f = Fixture::new(&files);
    let plan = f.rename("x/A.md", "x/B.md");
    assert!(plan.files.iter().all(|p| p.path != "notes/N.md"));
    assert_eq!(f.read("notes/N.md"), "[a](../img/A.md)\n");

    let f = Fixture::new(&files);
    f.rename("img/A.md", "img/C.md");
    // The rewrite writes a vault path, which still resolves to the moved note.
    assert_eq!(f.read("notes/N.md"), "[a](img/C.md)\n");
}

#[test]
fn ambiguity_that_predates_the_move_still_qualifies_the_rewrite() {
    // Two `Alpha.md` before the move and two after. The subject is the deep
    // one, addressed by its path; the bare name belongs to the other note both
    // before and after. The rewrite must stay qualified rather than shortening
    // to a name that means somebody else's note.
    let f = Fixture::new(&[
        ("Alpha.md", "# the root alpha\n"),
        ("Deep/Alpha.md", "# the deep alpha\n"),
        ("Home.md", "See [[Deep/Alpha]].\n"),
    ]);
    let plan = f.rename("Deep/Alpha.md", "Archive/Alpha.md");
    assert_eq!(f.read("Home.md"), "See [[Archive/Alpha]].\n");
    assert!(
        codes(&plan).contains(&"ambiguous_link"),
        "{:?}",
        plan.diagnostics
    );
}

#[test]
fn the_path_map_produces_the_hypothetical_corpus() {
    let paths: Vec<String> = ["Projects/Alpha.md", "Home.md"]
        .iter()
        .map(|s| s.to_string())
        .collect();
    let map = plan::PathMap::single("Projects/Alpha.md", "Archive/Alpha.md");
    assert_eq!(map.get("Projects/Alpha.md"), Some("Archive/Alpha.md"));
    assert_eq!(map.get("Home.md"), None);
    assert_eq!(
        map.apply(&paths),
        vec!["Archive/Alpha.md".to_string(), "Home.md".to_string()]
    );
}

#[test]
fn diagnostic_codes_are_stable_strings() {
    assert_eq!(DiagnosticCode::AmbiguousLink.as_str(), "ambiguous_link");
    assert_eq!(DiagnosticCode::PreBrokenLink.as_str(), "pre_broken_link");
    assert_eq!(DiagnosticCode::SelfLink.as_str(), "self_link");
    assert_eq!(
        DiagnosticCode::FrontmatterLinkUntouched.as_str(),
        "frontmatter_link_untouched"
    );
    assert_eq!(DiagnosticCode::CaseOnlyRename.as_str(), "case_only_rename");
    assert_eq!(
        DiagnosticCode::UnmappableLinkSpan.as_str(),
        "unmappable_link_span"
    );
    assert_eq!(
        DiagnosticCode::UnreadableCandidate.as_str(),
        "unreadable_candidate"
    );
    assert_eq!(
        DiagnosticCode::InvalidUtf8Candidate.as_str(),
        "invalid_utf8_candidate"
    );
}

// ── Bundle rename ─────────────────────────────────────────────────────────

#[test]
fn a_bundle_rename_moves_the_directory_the_entry_and_every_peer() {
    let f = Fixture::new(&[
        ("review/review.md", "# Review\n"),
        ("review/scripts/run.sh", "echo hi\n"),
        ("review/notes.md", "peer note\n"),
    ]);
    let plan = f.plan_bundle("review/review.md", "code-review/code-review.md");
    assert!(plan.ok(), "{:?}", plan.conflict);

    // The plan lists every peer for the user's consent, sorted for a stable
    // preview.
    let peer_froms: Vec<&str> = plan.peers.iter().map(|p| p.from.as_str()).collect();
    assert_eq!(peer_froms, vec!["review/notes.md", "review/scripts/run.sh"]);
    assert_eq!(
        plan.peers
            .iter()
            .find(|p| p.from == "review/scripts/run.sh")
            .unwrap()
            .to,
        "code-review/scripts/run.sh"
    );

    let result = f.apply_bundle(&plan);
    assert!(result.ok, "{:?}", result.conflict);
    assert!(result.renamed);
    assert!(result.skipped.is_empty(), "{:?}", result.skipped);
    let moved_froms: Vec<&str> = result.peers_moved.iter().map(|p| p.from.as_str()).collect();
    assert_eq!(moved_froms, peer_froms, "everything the plan named moved");

    assert!(!f.exists("review"));
    assert!(f.exists("code-review/code-review.md"));
    assert!(f.exists("code-review/scripts/run.sh"));
    assert!(f.exists("code-review/notes.md"));
    assert_eq!(f.read("code-review/scripts/run.sh"), "echo hi\n");
    assert_eq!(f.read("code-review/notes.md"), "peer note\n");
}

#[test]
fn a_bundle_rename_rewrites_a_wikilink_to_the_entry_and_an_embed_of_a_peer() {
    let f = Fixture::new(&[
        ("review/review.md", "# Review\n"),
        ("review/scripts/run.sh", "echo hi\n"),
        (
            "Home.md",
            "See [[review/review]] and an embed ![[review/scripts/run.sh]].\n",
        ),
    ]);
    let plan = f.plan_bundle("review/review.md", "code-review/code-review.md");
    assert!(plan.ok(), "{:?}", plan.conflict);
    assert_eq!(plan.edited_file_count(), 1);

    let result = f.apply_bundle(&plan);
    assert!(result.ok, "{:?}", result.conflict);
    assert_eq!(result.edited, vec!["Home.md".to_string()]);
    assert_eq!(
        f.read("Home.md"),
        "See [[code-review/code-review]] and an embed ![[code-review/scripts/run.sh]].\n"
    );
}

#[test]
fn a_bundle_rename_keeps_the_escape_before_a_table_cell_alias_pipe() {
    let f = Fixture::new(&[
        ("review/review.md", "# Review\n"),
        ("Home.md", "| [[review/review\\|Review]] |\n"),
    ]);
    let plan = f.plan_bundle("review/review.md", "code-review/code-review.md");
    assert!(plan.ok(), "{:?}", plan.conflict);
    let result = f.apply_bundle(&plan);
    assert!(result.ok, "{:?}", result.conflict);
    assert_eq!(
        f.read("Home.md"),
        "| [[code-review/code-review\\|Review]] |\n"
    );
}

#[test]
fn a_bundle_peer_note_that_links_within_the_bundle_is_rewritten_before_the_move() {
    let f = Fixture::new(&[
        ("review/review.md", "# Review\n"),
        ("review/notes.md", "See the entry: [[review/review]].\n"),
    ]);
    let plan = f.plan_bundle("review/review.md", "code-review/code-review.md");
    assert!(plan.ok(), "{:?}", plan.conflict);

    let result = f.apply_bundle(&plan);
    assert!(result.ok, "{:?}", result.conflict);
    assert_eq!(result.edited, vec!["review/notes.md".to_string()]);
    assert_eq!(
        f.read("code-review/notes.md"),
        "See the entry: [[code-review/code-review]].\n"
    );
}

#[test]
fn a_bundle_move_across_parents_keeps_the_leaf_name_and_skips_the_entry_rename() {
    let f = Fixture::new(&[
        ("review/review.md", "# Review\n"),
        ("review/scripts/run.sh", "x\n"),
    ]);
    let plan = f.plan_bundle("review/review.md", "docs/review/review.md");
    assert!(plan.ok(), "{:?}", plan.conflict);

    let result = f.apply_bundle(&plan);
    assert!(result.ok && result.renamed, "{:?}", result);
    assert!(f.exists("docs/review/review.md"));
    assert!(f.exists("docs/review/scripts/run.sh"));
    assert!(!f.exists("review"));
}

#[test]
fn a_failed_entry_rename_is_skipped_with_a_stable_reason() {
    // A non-empty folder already named like the new entry file blocks the
    // second rename, after the directory has moved.
    let f = Fixture::new(&[
        ("review/review.md", "# Review\n"),
        ("review/code-review.md/keep.txt", "x\n"),
    ]);
    let plan = f.plan_bundle("review/review.md", "code-review/code-review.md");
    assert!(plan.ok(), "{:?}", plan.conflict);

    let result = f.apply_bundle(&plan);
    assert!(result.ok && !result.renamed, "{result:?}");
    assert_eq!(result.skipped.len(), 1, "{:?}", result.skipped);
    assert_eq!(result.skipped[0].reason, "entry_rename_failed");
    let detail = result.conflict.unwrap_or_default();
    assert!(detail.contains("entry file rename failed"), "{detail:?}");
    assert!(f.exists("code-review/review.md"));
}

#[test]
fn a_bundle_rename_refuses_a_folder_name_that_does_not_match_the_file_stem() {
    let f = Fixture::new(&[("review/review.md", "# Review\n")]);
    let plan = f.plan_bundle("review/review.md", "code-review/other.md");
    assert!(!plan.ok());
    let conflict = plan.conflict.unwrap_or_default();
    assert!(conflict.contains("folder name must match"), "{conflict:?}");
}

#[test]
fn a_bundle_rename_refuses_an_occupied_destination_folder() {
    let f = Fixture::new(&[
        ("review/review.md", "# Review\n"),
        ("code-review/code-review.md", "# Other\n"),
    ]);
    let plan = f.plan_bundle("review/review.md", "code-review/code-review.md");
    assert!(!plan.ok());
    assert!(plan.conflict.unwrap().contains("already exists"));
}

#[test]
fn a_bundle_rename_refuses_a_from_that_is_not_a_bundle_entry() {
    let f = Fixture::new(&[("Notes/Alpha.md", "# Alpha\n")]);
    let plan = f.plan_bundle("Notes/Alpha.md", "Notes2/Notes2.md");
    assert!(!plan.ok());
    let conflict = plan.conflict.unwrap_or_default();
    assert!(conflict.contains("bundle entry"), "{conflict:?}");
}

#[test]
fn a_drifted_bundle_subject_aborts_everything() {
    let f = Fixture::new(&[
        ("review/review.md", "# Review\n"),
        ("review/scripts/run.sh", "x\n"),
    ]);
    let plan = f.plan_bundle("review/review.md", "code-review/code-review.md");
    let etag = plan
        .expect
        .iter()
        .find(|e| e.path == "review/review.md")
        .unwrap()
        .etag
        .clone();
    std::fs::write(f.path().join("review/review.md"), "# edited\n").unwrap();

    let result = crate::bundle::execute_bundle(
        f.path(),
        &f.facts(),
        "review/review.md",
        "code-review/code-review.md",
        Some(&etag),
        &plan.expect,
    )
    .unwrap();
    assert!(!result.ok);
    assert!(result.conflict.unwrap().contains("changed on disk"));
    // Nothing moved — not the directory, not the entry note.
    assert!(f.exists("review/review.md"));
    assert!(f.exists("review/scripts/run.sh"));
    assert!(!f.exists("code-review"));
}

#[test]
fn bundle_entry_recognises_the_name_name_md_convention_at_any_depth() {
    use crate::bundle::bundle_entry;
    assert_eq!(
        bundle_entry("review/review.md"),
        Some(("review", "review.md"))
    );
    assert_eq!(
        bundle_entry("components/code-review/code-review.md"),
        Some(("components/code-review", "code-review.md"))
    );
    assert_eq!(bundle_entry("review/other.md"), None);
    assert_eq!(bundle_entry("Alpha.md"), None, "no parent directory");
    assert_eq!(bundle_entry("review/review.txt"), None, "not markdown");
}

// ── Redirect: a deleted duplicate's links move to the kept copy ─────────────

#[test]
fn a_redirect_points_every_inbound_link_at_the_kept_copy() {
    let fx = Fixture::new(&[
        ("notes/overview.md", "# Overview\n"),
        ("old/overview copy.md", "# Overview\n"),
        (
            "index.md",
            "See [[overview copy]], ![[old/overview copy#Top|alias]] and \
             [it](old/overview%20copy.md).\n",
        ),
    ]);
    let plan = plan::plan_redirect(
        fx.path(),
        &fx.facts(),
        "old/overview copy.md",
        "notes/overview.md",
    )
    .expect("plan_redirect");
    assert!(plan.ok(), "{:?}", plan.conflict);
    let file = plan.files.iter().find(|f| f.path == "index.md").unwrap();
    assert_eq!(file.edits.len(), 3);

    let before = std::fs::read(fx.path().join("index.md")).unwrap();
    std::fs::write(
        fx.path().join("index.md"),
        crate::splice(&before, &file.edits),
    )
    .unwrap();
    assert_eq!(
        fx.read("index.md"),
        // The embed was written with its folder, so it keeps that depth.
        "See [[overview]], ![[notes/overview#Top|alias]] and [it](notes/overview.md).\n"
    );
}

#[test]
fn a_redirect_to_a_missing_note_is_refused() {
    let fx = Fixture::new(&[("a.md", "# A\n")]);
    let plan = plan::plan_redirect(fx.path(), &fx.facts(), "a.md", "b.md").unwrap();
    assert_eq!(plan.conflict.as_deref(), Some("no note at b.md"));
}
