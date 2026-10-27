//! Corpus discovery — walking roots to find `SKILL.md` files.
//!
//! # Why the walk is explicit rather than gitignore-aware
//!
//! Gitignore support is switched **off** here. Registered roots are arbitrary
//! directories — some are not git repos at all, and among those that are, a
//! `.claude/` is as likely to be gitignored (a personal skill set) as tracked.
//! Honouring gitignore would make discovery depend on a file the user never
//! thought about while registering the root, and would silently hide exactly
//! the skills they wanted found. The explicit [`SKIP_DIRS`] list is
//! predictable, does not vary per root, and covers the directories that
//! actually cost walk time.
//!
//! # Why the walker is a plain recursive walk
//!
//! `collect_skill_files` is a depth-bound, name-filtered walk written
//! against [`Vfs::read_dir`] so it runs identically on a host with no
//! filesystem. It keeps dot-directories, since `.claude/` and `.agents/` are where skills live. Do not reach for
//! `ignore::WalkBuilder`: every one of its features would have to be switched
//! off to match this behaviour, and it drags ripgrep's ignore-matching
//! machinery into the wasm bundle for nothing.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::corpus::CorpusRoot;
use crate::skill::{SkillRef, build_ref, forward_slashed};
use crate::vfs::Vfs;

/// Directory names never descended into. These are build output, dependency
/// trees, and VCS internals — none can contain an authored skill, and all are
/// large enough that walking them dominates a scan.
pub const SKIP_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    ".nuxt",
    ".output",
    ".turbo",
    ".venv",
    "vendor",
    "worktrees",
];

/// Path segments that mark a `SKILL.md` as test scaffolding rather than an
/// authored skill. This repo's own `project-check` suite carries a dozen
/// deliberately-malformed skills under `tests/skill-doc-fixtures/`; listing
/// them as real would make the roster actively misleading.
const FIXTURE_SEGMENTS: &[&str] = &["tests", "test", "fixtures", "__fixtures__", "testdata"];

/// Knobs for a scan. Defaults are tuned for a developer machine, not a server.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ScanOptions {
    /// How deep below a root to descend. Deep enough to reach
    /// `apps/<x>/.claude/skills/<name>/SKILL.md` in a nested workspace with room to
    /// spare; shallow enough that a mistakenly-registered `/` terminates.
    pub max_depth: usize,
    /// Include skills that look like test fixtures. Off by default; the UI
    /// offers it as a toggle so the fixtures stay reachable when someone is
    /// actually working on them.
    pub include_fixtures: bool,
}

impl Default for ScanOptions {
    fn default() -> Self {
        Self {
            max_depth: 10,
            include_fixtures: false,
        }
    }
}

/// The result of scanning one or more roots.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ScanReport {
    /// Every skill found, sorted by root kind, then root id, then path — so
    /// the roster is stable between scans and diffs cleanly.
    pub skills: Vec<SkillRef>,
    /// Ids of roots that were registered but are not currently readable.
    /// Reported rather than raised: one dead root must not fail the scan.
    pub unavailable_roots: Vec<String>,
    /// How many entries were withheld as fixtures. Surfaced so the UI can say
    /// "12 fixtures hidden" instead of silently under-reporting.
    pub excluded_fixtures: usize,
}

/// Scans several roots, in kind order, into one report.
pub fn scan_roots(vfs: &dyn Vfs, roots: &[CorpusRoot], options: &ScanOptions) -> ScanReport {
    let mut ordered: Vec<&CorpusRoot> = roots.iter().collect();
    ordered.sort_by(|a, b| a.kind.cmp(&b.kind).then_with(|| a.id.cmp(&b.id)));

    let mut report = ScanReport::default();
    for root in ordered {
        // Availability is asked of the `Vfs`, not of `CorpusRoot::is_available`
        // — the latter reaches `std::fs` directly and would call every root
        // dead on a host that has no filesystem.
        if !vfs.exists(&root.path) {
            report.unavailable_roots.push(root.id.clone());
            continue;
        }
        let mut one = scan_root(vfs, root, options);
        report.skills.append(&mut one.skills);
        report.excluded_fixtures += one.excluded_fixtures;
    }
    report
}

/// Scans a single root.
///
/// Never fails: an unreadable subdirectory is skipped, an unreadable
/// `SKILL.md` is skipped, and a malformed one is listed with a `problem`. A
/// roster that renders 200 skills and quietly drops 3 is far more useful than
/// one that refuses to render because of the 3.
pub fn scan_root(vfs: &dyn Vfs, root: &CorpusRoot, options: &ScanOptions) -> ScanReport {
    let mut report = ScanReport::default();

    let mut found = Vec::new();
    collect_skill_files(
        vfs,
        &root.path,
        Path::new(""),
        0,
        options.max_depth,
        &mut found,
    );

    for (skill_md, relative) in found {
        let relative_dir = forward_slashed(&relative);

        if !options.include_fixtures && looks_like_fixture(&relative) {
            report.excluded_fixtures += 1;
            continue;
        }

        let Ok(bytes) = vfs.read_file(&skill_md) else {
            continue;
        };
        let Ok(source) = String::from_utf8(bytes) else {
            continue;
        };
        report.skills.push(build_ref(root, &relative_dir, &source));
    }

    report
        .skills
        .sort_by(|a, b| a.relative_dir.cmp(&b.relative_dir));
    report
}

/// Collects `(absolute SKILL.md, directory relative to the root)` for every
/// skill under `dir`, pushing them in a deterministic order.
///
/// `depth` is the depth of `dir` itself and matches `WalkBuilder::max_depth`
/// exactly: depth 0 is the root, its children are depth 1, and an entry is
/// visited only while its own depth is within `max_depth`. Recursion is
/// therefore bounded by `max_depth` (10 by default), which is what makes
/// straight recursion safe here rather than an explicit stack.
///
/// Each directory's entries are sorted before descent, so the traversal — not
/// just the sorted output — is reproducible whatever order a host's `read_dir`
/// happens to return.
fn collect_skill_files(
    vfs: &dyn Vfs,
    dir: &Path,
    relative: &Path,
    depth: usize,
    max_depth: usize,
    out: &mut Vec<(PathBuf, PathBuf)>,
) {
    if depth >= max_depth {
        return;
    }
    // An unreadable directory is skipped, never raised — one bad subtree must
    // not cost the user the other 200 skills.
    let Ok(mut entries) = vfs.read_dir(dir) else {
        return;
    };
    entries.sort_by(|a, b| a.name.cmp(&b.name));

    for entry in entries {
        if entry.is_dir {
            if SKIP_DIRS.contains(&entry.name.as_str()) {
                continue;
            }
            collect_skill_files(
                vfs,
                &dir.join(&entry.name),
                &relative.join(&entry.name),
                depth + 1,
                max_depth,
                out,
            );
        } else if entry.name == "SKILL.md" {
            out.push((dir.join(&entry.name), relative.to_path_buf()));
        }
    }
}

/// True when any path segment marks this as test scaffolding.
fn looks_like_fixture(relative_dir: &Path) -> bool {
    relative_dir.components().any(|c| {
        c.as_os_str()
            .to_str()
            .is_some_and(|s| FIXTURE_SEGMENTS.contains(&s))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::corpus::RootKind;
    use crate::vfs::{MemVfs, NativeVfs};

    /// Builds a corpus on disk. Each entry is `(relative dir, frontmatter name)`.
    fn corpus(entries: &[(&str, &str)]) -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        for (rel, name) in entries {
            let skill_dir = dir.path().join(rel);
            std::fs::create_dir_all(&skill_dir).unwrap();
            std::fs::write(
                skill_dir.join("SKILL.md"),
                format!("---\nname: {name}\ndescription: d\n---\nbody\n"),
            )
            .unwrap();
        }
        dir
    }

    fn root_at(dir: &tempfile::TempDir) -> CorpusRoot {
        CorpusRoot::new("r", "R", dir.path(), RootKind::Project)
    }

    #[test]
    fn finds_skills_across_every_runtime_layout() {
        // The real shapes: per-runtime exports plus a plugin-native `skills/`.
        let dir = corpus(&[
            (".claude/skills/alpha", "alpha"),
            (".agents/skills/alpha", "alpha"),
            (".opencode/skills/alpha", "alpha"),
            ("repo/tools/skills/beta", "beta"),
        ]);
        let report = scan_root(&NativeVfs, &root_at(&dir), &ScanOptions::default());

        assert_eq!(report.skills.len(), 4);
        let runtimes: Vec<_> = report.skills.iter().map(|s| s.runtime.as_deref()).collect();
        assert!(runtimes.contains(&Some("claude")));
        assert!(runtimes.contains(&Some("agents")));
        assert!(runtimes.contains(&Some("opencode")));
        // The plugin-native layout belongs to no runtime.
        assert!(runtimes.contains(&None));
    }

    #[test]
    fn skips_heavy_directories() {
        let dir = corpus(&[
            (".claude/skills/real", "real"),
            ("node_modules/pkg/.claude/skills/vendored", "vendored"),
            ("target/debug/.claude/skills/built", "built"),
        ]);
        let report = scan_root(&NativeVfs, &root_at(&dir), &ScanOptions::default());

        let names: Vec<_> = report.skills.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(names, vec!["real"]);
    }

    #[test]
    fn withholds_fixtures_but_counts_them() {
        let dir = corpus(&[
            (".claude/skills/real", "real"),
            (
                ".claude/skills/checker/tests/skill-doc-fixtures/bad/plugin/skills/x",
                "fixture",
            ),
        ]);
        let report = scan_root(&NativeVfs, &root_at(&dir), &ScanOptions::default());

        assert_eq!(report.skills.len(), 1);
        assert_eq!(report.skills[0].name, "real");
        // Counted, not silently dropped.
        assert_eq!(report.excluded_fixtures, 1);
    }

    #[test]
    fn fixtures_are_reachable_when_asked_for() {
        let dir = corpus(&[(".claude/skills/checker/tests/fixtures/x", "fixture")]);
        let options = ScanOptions {
            include_fixtures: true,
            ..Default::default()
        };
        let report = scan_root(&NativeVfs, &root_at(&dir), &options);

        assert_eq!(report.skills.len(), 1);
        assert_eq!(report.excluded_fixtures, 0);
    }

    #[test]
    fn a_malformed_skill_is_listed_with_a_problem() {
        let dir = tempfile::tempdir().unwrap();
        let skill_dir = dir.path().join(".claude/skills/broken");
        std::fs::create_dir_all(&skill_dir).unwrap();
        std::fs::write(skill_dir.join("SKILL.md"), "---\nname: [oops\n---\nbody\n").unwrap();

        let report = scan_root(&NativeVfs, &root_at(&dir), &ScanOptions::default());

        // Listed, not hidden — a broken skill must be visible to be fixable.
        assert_eq!(report.skills.len(), 1);
        assert_eq!(report.skills[0].name, "broken");
        assert!(report.skills[0].problem.is_some());
    }

    #[test]
    fn depth_limit_bounds_the_walk() {
        let dir = corpus(&[("a/b/c/d/e/f/.claude/skills/deep", "deep")]);
        let options = ScanOptions {
            max_depth: 3,
            ..Default::default()
        };
        assert!(
            scan_root(&NativeVfs, &root_at(&dir), &options)
                .skills
                .is_empty()
        );
        assert_eq!(
            scan_root(&NativeVfs, &root_at(&dir), &ScanOptions::default())
                .skills
                .len(),
            1
        );
    }

    /// The three walk rules that survived dropping `ignore`, checked together
    /// against an in-memory tree — which also proves a scan runs with no
    /// filesystem under it at all, the point of the whole seam.
    #[test]
    fn the_walk_keeps_dot_dirs_prunes_by_name_and_bounds_by_depth() {
        let vfs = MemVfs::new();
        let write = |rel: &str| {
            let path = PathBuf::from("/corpus").join(rel);
            vfs.create_dir_all(path.parent().unwrap()).unwrap();
            vfs.write_file(&path, b"---\nname: n\ndescription: d\n---\nbody\n")
                .unwrap();
        };
        // Depth 4: kept, and a dot-directory on the way — the case that would
        // break if a hidden-file filter ever came back.
        write(".claude/skills/dotted/SKILL.md");
        // Depth 2: kept.
        write("top/SKILL.md");
        // Depth 3, but under a pruned directory name.
        write("node_modules/pkg/SKILL.md");
        // Depth 5: past the bound.
        write("a/b/c/d/SKILL.md");

        let root = CorpusRoot::new("m", "M", "/corpus", RootKind::Project);
        let options = ScanOptions {
            max_depth: 4,
            ..Default::default()
        };
        let report = scan_root(&vfs, &root, &options);

        let dirs: Vec<_> = report
            .skills
            .iter()
            .map(|s| s.relative_dir.as_str())
            .collect();
        assert_eq!(dirs, vec![".claude/skills/dotted", "top"]);
    }

    #[test]
    fn results_are_deterministically_ordered() {
        let dir = corpus(&[
            (".claude/skills/zulu", "zulu"),
            (".claude/skills/alpha", "alpha"),
            (".claude/skills/mike", "mike"),
        ]);
        let report = scan_root(&NativeVfs, &root_at(&dir), &ScanOptions::default());

        let dirs: Vec<_> = report
            .skills
            .iter()
            .map(|s| s.relative_dir.as_str())
            .collect();
        assert_eq!(
            dirs,
            vec![
                ".claude/skills/alpha",
                ".claude/skills/mike",
                ".claude/skills/zulu"
            ]
        );
    }

    #[test]
    fn unavailable_roots_are_reported_not_raised() {
        let live = corpus(&[(".claude/skills/real", "real")]);
        let roots = vec![
            CorpusRoot::new("live", "Live", live.path(), RootKind::Project),
            CorpusRoot::new("dead", "Dead", "/nonexistent/path", RootKind::Registered),
        ];
        let report = scan_roots(&NativeVfs, &roots, &ScanOptions::default());

        // The live root still produced results.
        assert_eq!(report.skills.len(), 1);
        assert_eq!(report.unavailable_roots, vec!["dead"]);
    }

    #[test]
    fn roots_are_scanned_in_kind_order() {
        let a = corpus(&[(".claude/skills/from-user", "from-user")]);
        let b = corpus(&[(".claude/skills/from-project", "from-project")]);
        let roots = vec![
            CorpusRoot::new("u", "U", a.path(), RootKind::UserGlobal),
            CorpusRoot::new("p", "P", b.path(), RootKind::Project),
        ];
        let report = scan_roots(&NativeVfs, &roots, &ScanOptions::default());

        // Project-local skills lead; they are the ones being worked on.
        assert_eq!(report.skills[0].root_id, "p");
        assert_eq!(report.skills[1].root_id, "u");
    }

    #[test]
    fn ids_are_unique_and_namespaced_by_root() {
        // The same skill exported to two runtimes must not collide.
        let dir = corpus(&[
            (".claude/skills/alpha", "alpha"),
            (".agents/skills/alpha", "alpha"),
        ]);
        let report = scan_root(&NativeVfs, &root_at(&dir), &ScanOptions::default());

        let ids: std::collections::HashSet<_> =
            report.skills.iter().map(|s| s.id.as_str()).collect();
        assert_eq!(ids.len(), 2);
        assert!(ids.contains("r:.claude/skills/alpha"));
        assert!(ids.contains("r:.agents/skills/alpha"));
    }
}
