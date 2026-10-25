//! The validate entry points — the one-pass over the planes that produces the merged,
//! deterministically sorted `Vec<Finding>`.
//!
//! One pass, mirroring the TS `validate.ts`:
//!
//! 1. parse `source` (or accept a pre-parsed [`DocTree`]);
//! 2. the contract-independent outline check ([`scan_heading_depth_jumps`]);
//! 3. the STRUCTURE plane ([`match_structure`]) — its kind-gate gates the content leaf,
//!    and node-local rules (including section-scoped text constraints) run with it;
//! 4. the CONTENT plane ([`match_content`]) — the frontmatter schema plus each declared
//!    section's content leaf over a present, correct-kind block;
//! 5. the doc-scoped RULE plane ([`DocRule`](crate::contract::DocRule)s — including
//!    document-scoped text constraints);
//! 6. merge + deterministically SORT ([`sort_findings`]).
//!
//! The sort reproduces the TS comparator exactly: ascending `pos.line` (no-pos sorts
//! first, as line 0), then `pos.col` (no-col as 0), then plane rank (frontmatter →
//! structure → content → text → rule), then stable emission order.

use crate::content::match_content;
use crate::contract::Contract;
use crate::finding::Finding;
use crate::parse::parse_document;
use crate::registry::{Ctx, Registry};
use crate::structure::{match_structure, scan_heading_depth_jumps};
use crate::tree::DocTree;

// ── Deterministic ordering ───────────────────────────────────────────────

/// The merge planes, in their tie-break order. Any id outside the named planes (a
/// contract-chosen rule namespace like `task/...` or `summary/...`) is the `rule` plane.
const PLANE_ORDER: [&str; 5] = ["frontmatter", "structure", "content", "text", "rule"];

/// The plane a finding belongs to, derived from its id prefix.
fn plane_rank(id: &str) -> usize {
    let area = id.split('/').next().unwrap_or("");
    PLANE_ORDER
        .iter()
        .position(|p| *p == area)
        .unwrap_or(PLANE_ORDER.len() - 1)
}

/// Sort findings deterministically so goldens pin: line asc (no-pos first,
/// as 0), then col (no-col as 0), then plane order, then stable emission order. Rust's
/// stable sort supplies the same emission-index tie-break the TS comparator encodes.
pub fn sort_findings(mut findings: Vec<Finding>) -> Vec<Finding> {
    findings.sort_by_key(|f| {
        let line = f.pos.map_or(0, |p| p.line);
        let col = f.pos.and_then(|p| p.col).unwrap_or(0);
        (line, col, plane_rank(&f.id))
    });
    findings
}

// ── The one-pass orchestration ────────────────────────────────────────────────────────

/// Validate a pre-parsed tree against a contract: outline scan, structure plane (with
/// node-local rules), content plane (frontmatter schema + content leaves), doc-scoped
/// rules, deterministic sort.
pub fn validate_tree(tree: &DocTree, contract: &Contract, path: &str) -> Vec<Finding> {
    let registry = Registry::default();
    let ctx = Ctx::new(path, &registry);

    // Contract-independent outline check: a sub-heading that skips a level (H2→H4)
    // warns, whether or not the grammar declares those sections.
    let mut findings = scan_heading_depth_jumps(&tree.root, &ctx);

    // Structure plane — must run before content (its kind-gate gates the content leaf).
    if let Some(body) = &contract.body {
        findings.extend(match_structure(&tree.root, body, &ctx));
    }

    // Content plane: the frontmatter schema plus each section's content leaf over a
    // present, correct-kind block (guarded inside so it never re-reports the kind-gate).
    findings.extend(match_content(tree, contract, &ctx));

    // Rule plane: doc-scoped rules over the projected tree.
    for r in &contract.rules {
        findings.extend(r.run(tree, &ctx));
    }

    // The outermost hint fallback: a finding with no nearer description in
    // scope inherits the contract root's. A no-op for v1 / description-free contracts,
    // keeping their findings byte-identical.
    if let Some(root_hint) = &contract.description {
        for finding in &mut findings {
            if finding.hint.is_none() {
                finding.hint = Some(root_hint.clone());
            }
        }
    }

    sort_findings(findings)
}

/// The string-in convenience: parse (frontmatter split + projection), then validate
/// every plane in the TS orchestration order.
pub fn validate(source: &str, contract: &Contract, path: &str) -> Vec<Finding> {
    validate_tree(&parse_document(source), contract, path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::{Contract, LevelOpts, doc_rule, section, sections};
    use crate::finding::{FindingLevel, SourcePos};
    use crate::registry::FindingSpec;

    fn f(id: &str, line: Option<u32>, col: Option<u32>) -> Finding {
        Finding {
            id: id.into(),
            level: FindingLevel::Error,
            path: "doc.md".into(),
            pos: line.map(|l| SourcePos { line: l, col }),
            message: String::new(),
            hint: None,
            fix: None,
        }
    }

    fn ids_in_order(findings: &[Finding]) -> Vec<&str> {
        findings.iter().map(|x| x.id.as_str()).collect()
    }

    // Contract first: the four comparator clauses, one case each.
    #[test]
    fn sorts_by_line_with_no_pos_first() {
        let out = sort_findings(vec![
            f("structure/a", Some(9), None),
            f("structure/b", None, None),
            f("structure/c", Some(1), None),
        ]);
        assert_eq!(
            ids_in_order(&out),
            vec!["structure/b", "structure/c", "structure/a"]
        );
    }

    #[test]
    fn line_ties_break_by_col_with_no_col_first() {
        let out = sort_findings(vec![
            f("structure/a", Some(3), Some(7)),
            f("structure/b", Some(3), None),
            f("structure/c", Some(3), Some(2)),
        ]);
        assert_eq!(
            ids_in_order(&out),
            vec!["structure/b", "structure/c", "structure/a"]
        );
    }

    #[test]
    fn full_ties_break_by_plane_order() {
        let out = sort_findings(vec![
            f("task/custom", Some(3), Some(1)), // rule plane (unnamed prefix)
            f("text/requires", Some(3), Some(1)),
            f("content/max-words", Some(3), Some(1)),
            f("structure/block-kind", Some(3), Some(1)),
            f("frontmatter/enum", Some(3), Some(1)),
        ]);
        assert_eq!(
            ids_in_order(&out),
            vec![
                "frontmatter/enum",
                "structure/block-kind",
                "content/max-words",
                "text/requires",
                "task/custom"
            ]
        );
    }

    #[test]
    fn emission_order_is_the_final_stable_tie_break() {
        let out = sort_findings(vec![
            f("structure/first", Some(3), Some(1)),
            f("structure/second", Some(3), Some(1)),
        ]);
        assert_eq!(
            ids_in_order(&out),
            vec!["structure/first", "structure/second"]
        );
    }

    // The convenience door: source in, sorted findings out; doc rules run after structure.
    #[test]
    fn validate_runs_structure_and_doc_rules_in_one_pass() {
        let contract = Contract::new()
            .body(sections(LevelOpts::default(), vec![section("Overview")]))
            .doc_rule(doc_rule("task/post-mortem-when-worked", |tree, ctx| {
                vec![
                    ctx.finding(
                        FindingSpec::new("task/post-mortem-when-worked", "post-mortem required")
                            .pos(tree.root.sections[0].pos),
                    ),
                ]
            }));
        let out = validate("## Summary\n\nprose\n", &contract, "task.md");
        // Same line 1: structure sorts before the rule plane.
        assert_eq!(
            out.iter().map(|x| x.id.as_str()).collect::<Vec<_>>(),
            vec!["structure/section-missing", "task/post-mortem-when-worked"]
        );
        assert_eq!(out[0].path, "task.md");
    }

    #[test]
    fn a_contract_with_no_body_only_scans_the_outline() {
        let out = validate("## A\n\n#### Deep\n\nx\n", &Contract::new(), "n.md");
        assert_eq!(
            out.iter()
                .map(|x| (x.id.as_str(), x.level))
                .collect::<Vec<_>>(),
            vec![("structure/heading-depth-jump", FindingLevel::Warn)]
        );
    }
}
