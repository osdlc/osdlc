//! Nested edits on YAML files nobody wrote for a test.
//!
//! `tests/fixtures/real/` holds copies of files from this repository: GitHub
//! workflows and actions, `pnpm-workspace.yaml`, Obsidian index definitions,
//! markdown-contract files and two Markdown frontmatter blocks. They are
//! copies, so the expectations do not move when the originals change.
//!
//! For every node of every file, the test plans a `RemovePath`, and for every
//! scalar leaf a `SetPath` to a new string. A result must read as the
//! in-memory model of the edit (`tests/model`), or be a refusal. A `Set` of a
//! one-line scalar must change one line and keep the line count: it may not
//! rewrite the parent around it.
//!
//! A path that steps through a sequence index needs tier 2. The edits of each
//! tier run once that tier is in [`ENABLED_TIERS`].

mod model;

use model::{PathEdit, Seg, apply, read};
use yaml_splice::Value;

/// The tiers whose edits run. Raised as each tier is implemented.
const ENABLED_TIERS: &[u64] = &[];

const FILES: &[(&str, &str)] = &[
    (
        "contract-07",
        include_str!("fixtures/real/contract-07-frontmatter-only-zod.yaml"),
    ),
    (
        "contract-09",
        include_str!("fixtures/real/contract-09-section-content-leaf-maxwords-anchor.yaml"),
    ),
    (
        "contract-10",
        include_str!("fixtures/real/contract-10-table-leaf-columns-minrows.yaml"),
    ),
    (
        "frontmatter-check-pr",
        include_str!("fixtures/real/frontmatter-skill-check-pr.yaml"),
    ),
    (
        "frontmatter-code-review",
        include_str!("fixtures/real/frontmatter-skill-code-review.yaml"),
    ),
    (
        "gh-action-rust-build-cache",
        include_str!("fixtures/real/gh-action-rust-build-cache.yml"),
    ),
    (
        "gh-action-rust-toolchain",
        include_str!("fixtures/real/gh-action-rust-toolchain.yml"),
    ),
    (
        "gh-workflow-packages-ci",
        include_str!("fixtures/real/gh-workflow-packages-ci.yml"),
    ),
    (
        "gh-workflow-packages-publish",
        include_str!("fixtures/real/gh-workflow-packages-publish.yml"),
    ),
    (
        "gh-workflow-packages-windows-tier2",
        include_str!("fixtures/real/gh-workflow-packages-windows-tier2.yml"),
    ),
    (
        "gh-workflow-release-plz",
        include_str!("fixtures/real/gh-workflow-release-plz.yml"),
    ),
    (
        "gh-workflow-rust-ci",
        include_str!("fixtures/real/gh-workflow-rust-ci.yml"),
    ),
    (
        "gh-workflow-site",
        include_str!("fixtures/real/gh-workflow-site.yml"),
    ),
    (
        "gh-workflow-tag",
        include_str!("fixtures/real/gh-workflow-tag.yml"),
    ),
    (
        "gh-workflow-test",
        include_str!("fixtures/real/gh-workflow-test.yml"),
    ),
    (
        "obsidian-index-backlog",
        include_str!("fixtures/real/obsidian-index-backlog.yaml"),
    ),
    (
        "obsidian-index-milestone",
        include_str!("fixtures/real/obsidian-index-milestone.yaml"),
    ),
    (
        "obsidian-index-roadmap",
        include_str!("fixtures/real/obsidian-index-roadmap.yaml"),
    ),
    (
        "obsidian-index-task",
        include_str!("fixtures/real/obsidian-index-task.yaml"),
    ),
    (
        "pnpm-workspace",
        include_str!("fixtures/real/pnpm-workspace.yaml"),
    ),
];

/// The value every `SetPath` writes: a one-line string no file holds.
const NEW: &str = "set-by-test";

/// Every path to a node below the root, in document order, with whether the
/// node is a scalar.
fn paths(node: &Value, prefix: &mut Vec<Seg>, out: &mut Vec<(Vec<Seg>, bool)>) {
    match node {
        Value::Map(m) => {
            for (k, v) in m.iter() {
                prefix.push(Seg::Key(k.to_string()));
                out.push((prefix.clone(), !v.is_collection()));
                paths(v, prefix, out);
                prefix.pop();
            }
        }
        Value::Seq(items) => {
            for (i, v) in items.iter().enumerate() {
                prefix.push(Seg::Index(i));
                out.push((prefix.clone(), !v.is_collection()));
                paths(v, prefix, out);
                prefix.pop();
            }
        }
        _ => {}
    }
}

fn tier(path: &[Seg]) -> u64 {
    if path.iter().any(|s| matches!(s, Seg::Index(_))) {
        2
    } else {
        1
    }
}

/// One planned edit and what the document must read as afterwards.
#[expect(
    dead_code,
    reason = "`want` and `one_line` are read by `run` from tier 1"
)]
struct Planned {
    edit: PathEdit,
    tier: u64,
    want: Value,
    /// A `Set` of a one-line scalar: the output must keep the line count.
    one_line: bool,
}

fn plan(src: &str) -> Vec<Planned> {
    let root = read(src).expect("a real file parses");
    let mut all = Vec::new();
    paths(&root, &mut Vec::new(), &mut all);
    let mut out = Vec::new();
    for (path, scalar) in all {
        let mut edits = vec![PathEdit::Remove(path.clone())];
        if scalar {
            edits.push(PathEdit::Set(path.clone(), Value::from(NEW)));
        }
        for edit in edits {
            let mut want = root.clone();
            apply(&mut want, &edit, true).expect("the model applies a planned edit");
            let one_line = matches!(edit, PathEdit::Set(..)) && one_line_leaf(&root, &path);
            out.push(Planned {
                edit,
                tier: tier(&path),
                want,
                one_line,
            });
        }
    }
    out
}

/// Whether the scalar at `path` is one that a reader would write on one line:
/// not a string holding a line break.
fn one_line_leaf(root: &Value, path: &[Seg]) -> bool {
    let mut node = root;
    for seg in path {
        node = match (node, seg) {
            (Value::Map(m), Seg::Key(k)) => m.get(k).expect("a planned path exists"),
            (Value::Seq(items), Seg::Index(i)) => &items[*i],
            _ => unreachable!("a planned path exists"),
        };
    }
    !node.as_str().is_some_and(|s| s.contains('\n'))
}

#[test]
fn every_node_of_every_real_file_is_edited() {
    let mut planned = [0usize; 3];
    let mut failures = Vec::new();
    for (name, src) in FILES {
        assert!(
            matches!(read(src), Ok(Value::Map(_))),
            "{name} does not parse to a mapping"
        );
        for p in plan(src) {
            planned[p.tier as usize] += 1;
            if !ENABLED_TIERS.contains(&p.tier) {
                continue;
            }
            if let Err(msg) = run(src, &p) {
                failures.push(format!("  [{name}] {:?}: {msg}", p.edit));
            }
        }
    }
    eprintln!(
        "real files: {} tier 1 edits, {} tier 2 edits",
        planned[1], planned[2]
    );
    assert!(
        failures.is_empty(),
        "{} real-file edits went wrong:\n{}",
        failures.len(),
        failures.join("\n")
    );
    // Pinned: the files are fixed copies, so a change here means the walk or
    // the model changed.
    assert_eq!(planned, [0, 642, 1228], "edits planned by tier");
}

/// Runs one planned edit through the edit functions.
///
/// Tier 1 replaces the body: call `edit_yaml` with the crate's path edit,
/// require the result to read as `p.want` (or a refusal), and, when
/// `p.one_line`, require the line count to stay and one line to differ.
fn run(_src: &str, _p: &Planned) -> Result<(), String> {
    Err("path edits are not implemented yet".to_string())
}
