//! Text-constraint builders: [`requires`] and [`forbids`] (section rules) and
//! [`text_rule`] (a document rule), ported from the TS `text-constraints.ts`.
//!
//! Each builder runs the text-match core ([`crate::text_match`]) over its scope's text.
//! The text is rebuilt from the projected tree with every block (prose, list items,
//! table cells, code) on its real source line, so a `forbids` hit reports its true
//! line. A section scope's key is the heading's lowerCamelCase key; the document's is
//! `"doc"`.
//!
//! A builder panics on an authoring error, as the TS builders throw: a `requires` entry
//! whose bound means absence (`max: 0`, or `max` below the minimum), an entry with no
//! needle, or a `regex` the `regex` crate rejects. The declarative compiler screens the
//! same errors out first as a `DeclarativeError`.

use regex::Regex;

use crate::camel::to_camel_key;
use crate::contract::{DocRule, Rule};
use crate::finding::Finding;
use crate::registry::Ctx;
use crate::text_match::{
    TextFindingInput, TextKind, TextMatchSpec, build_regex_or_panic, build_text_findings,
    match_text,
};
use crate::tree::{BlockNode, DocTree, SectionNode};

// ── Purity: a `requires` entry may not express absence ───────────────────────

/// Reject a `requires` entry whose count bound means absence (`max: 0`, or any `max`
/// below the entry's minimum). Panics, as the TS builders throw `ContractBuildError`.
fn assert_requires_purity(specs: &[TextMatchSpec]) {
    for spec in specs {
        let floor = spec.min.unwrap_or(1.0).max(1.0);
        if let Some(max) = spec.max
            && max < floor
        {
            panic!(
                "contract/text-requires-purity: requires({}): a requires entry may not express absence (max {max} < {floor}); use forbids(...) for an absence check",
                spec.repr()
            );
        }
    }
}

// ── Line-faithful scope-text reconstruction ───────────────────────────────────────────

/// Accumulates text fragments at their 1-based source lines and renders them into one
/// string whose newline structure mirrors the source. A multi-line fragment places each
/// of its lines on a consecutive source line; two fragments on one line space-join.
struct LineBuffer {
    lines: Vec<String>,
}

impl LineBuffer {
    fn new() -> Self {
        Self { lines: Vec::new() }
    }

    fn place(&mut self, line: u32, text: &str) {
        if text.is_empty() {
            return;
        }
        for (i, part) in text.split('\n').enumerate() {
            let Some(idx) = (line as usize + i).checked_sub(1) else {
                continue;
            };
            while self.lines.len() <= idx {
                self.lines.push(String::new());
            }
            let existing = &mut self.lines[idx];
            if existing.is_empty() {
                existing.push_str(part);
            } else {
                existing.push(' ');
                existing.push_str(part);
            }
        }
    }

    fn render(&self) -> String {
        self.lines.join("\n")
    }
}

/// Place one projected block's text at its real source line(s).
fn place_block(buf: &mut LineBuffer, block: &BlockNode) {
    match block {
        BlockNode::Paragraph { text, pos, .. } => buf.place(pos.line, text),
        BlockNode::List { items, .. } => {
            for item in items {
                buf.place(item.pos.line, &item.text);
            }
        }
        BlockNode::Code {
            value, fenced, pos, ..
        } => buf.place(pos.line + u32::from(*fenced), value),
        BlockNode::Table {
            columns,
            rows,
            row_pos,
            pos,
            ..
        } => {
            buf.place(pos.line, &columns.join(" "));
            for (i, row) in rows.iter().enumerate() {
                if let Some(rp) = row_pos.get(i) {
                    buf.place(rp.line, &row.join(" "));
                }
            }
        }
    }
}

/// The section's subtree text, reconstructed line-faithfully: every block of this
/// section and every descendant, placed at its real source line.
fn section_scope_text(node: &SectionNode) -> String {
    fn walk(n: &SectionNode, buf: &mut LineBuffer) {
        for block in &n.blocks {
            place_block(buf, block);
        }
        for child in &n.sections {
            walk(child, buf);
        }
    }
    let mut buf = LineBuffer::new();
    walk(node, &mut buf);
    buf.render()
}

/// The whole-document scope text, reconstructed line-faithfully from the projected tree.
fn doc_scope_text(tree: &DocTree) -> String {
    section_scope_text(&tree.root)
}

// ── The builders ──────────────────────────────────────────────────────────────────────

/// A spec with its needle compiled.
pub(crate) type CompiledSpec = (TextMatchSpec, Option<Regex>);

type Compiled = Vec<CompiledSpec>;

/// # Panics
/// When a spec has no needle or its `regex` does not compile.
fn compile(specs: Vec<TextMatchSpec>) -> Compiled {
    specs
        .into_iter()
        .map(|spec| {
            let re = build_regex_or_panic(&spec);
            (spec, re)
        })
        .collect()
}

struct TextNodeRule {
    kind: TextKind,
    id: &'static str,
    specs: Compiled,
}

impl Rule for TextNodeRule {
    fn id(&self) -> &str {
        self.id
    }

    fn run(&self, node: &SectionNode, ctx: &Ctx) -> Vec<Finding> {
        let scope_key = to_camel_key(&node.name);
        let text = section_scope_text(node);
        let mut out = Vec::new();
        for (spec, re) in &self.specs {
            out.extend(build_text_findings(
                TextFindingInput {
                    kind: self.kind,
                    spec,
                    result: match_text(&text, re.as_ref()),
                    scope_key: &scope_key,
                    scope: Some(&node.name),
                    scope_pos: Some(node.pos),
                },
                ctx,
            ));
        }
        out
    }
}

/// Require each listed phrase to be PRESENT in the bound section's subtree text — a
/// node-local [`Rule`] for a section's `rules` slot. Each entry emits its own
/// `text/requires` finding at the section heading when its phrase is absent (or
/// `text/count` when a `min` / `max` bound is violated).
///
/// # Panics
/// On an absence-form entry (`max: 0` or `max < min`; use [`forbids`]), an entry with
/// no needle, or a `regex` the `regex` crate rejects.
pub fn requires(specs: Vec<TextMatchSpec>) -> Box<dyn Rule> {
    assert_requires_purity(&specs);
    requires_compiled(compile(specs))
}

/// [`requires`] over specs the declarative loader has already screened and compiled.
pub(crate) fn requires_compiled(specs: Compiled) -> Box<dyn Rule> {
    Box::new(TextNodeRule {
        kind: TextKind::Requires,
        id: "text/requires",
        specs,
    })
}

/// Forbid each listed phrase from appearing in the bound section's subtree text — a
/// node-local [`Rule`]. Each entry emits a `text/forbids` finding at the offending line
/// for every hit (or `text/count` at the heading when a positive `max` cap is exceeded).
///
/// # Panics
/// On an entry with no needle, or a `regex` the `regex` crate rejects.
pub fn forbids(specs: Vec<TextMatchSpec>) -> Box<dyn Rule> {
    forbids_compiled(compile(specs))
}

/// [`forbids`] over specs the declarative loader has already compiled.
pub(crate) fn forbids_compiled(specs: Compiled) -> Box<dyn Rule> {
    Box::new(TextNodeRule {
        kind: TextKind::Forbids,
        id: "text/forbids",
        specs,
    })
}

/// The document-scoped options for [`text_rule`] — `requires` / `forbids` lists, each a
/// set of independent whole-document checks.
#[derive(Default)]
pub struct TextRuleSpec {
    /// entries that must be found
    pub requires: Vec<TextMatchSpec>,
    /// entries that must not be found
    pub forbids: Vec<TextMatchSpec>,
}

struct TextDocRule {
    requires: Compiled,
    forbids: Compiled,
}

impl DocRule for TextDocRule {
    fn id(&self) -> &str {
        "text/doc"
    }

    fn run(&self, tree: &DocTree, ctx: &Ctx) -> Vec<Finding> {
        let text = doc_scope_text(tree);
        let mut out = Vec::new();
        for (spec, re) in &self.requires {
            out.extend(build_text_findings(
                TextFindingInput {
                    kind: TextKind::Requires,
                    spec,
                    result: match_text(&text, re.as_ref()),
                    scope_key: "doc",
                    scope: None,
                    scope_pos: None,
                },
                ctx,
            ));
        }
        for (spec, re) in &self.forbids {
            out.extend(build_text_findings(
                TextFindingInput {
                    kind: TextKind::Forbids,
                    spec,
                    result: match_text(&text, re.as_ref()),
                    scope_key: "doc",
                    scope: None,
                    scope_pos: None,
                },
                ctx,
            ));
        }
        out
    }
}

/// Attach required / forbidden phrase checks to the WHOLE document — a cross-plane
/// [`DocRule`] for a contract's `rules` slot. A `requires` miss is document-level (no
/// position); each `forbids` hit anchors at the exact offending source line.
///
/// # Panics
/// As [`requires`] and [`forbids`] do.
pub fn text_rule(spec: TextRuleSpec) -> Box<dyn DocRule> {
    assert_requires_purity(&spec.requires);
    text_rule_compiled(compile(spec.requires), compile(spec.forbids))
}

/// [`text_rule`] over specs the declarative loader has already screened and compiled.
pub(crate) fn text_rule_compiled(requires: Compiled, forbids: Compiled) -> Box<dyn DocRule> {
    Box::new(TextDocRule { requires, forbids })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::{Contract, LevelOpts, SectionOpts, section, section_with, sections};
    use crate::finding::FindingLevel;
    use crate::validate::validate;

    fn pattern(p: &str) -> TextMatchSpec {
        TextMatchSpec {
            pattern: Some(p.into()),
            ..Default::default()
        }
    }

    fn brief(findings: &[Finding]) -> Vec<(&str, FindingLevel, Option<u32>)> {
        findings
            .iter()
            .map(|f| (f.id.as_str(), f.level, f.pos.map(|p| p.line)))
            .collect()
    }

    // Contract first — the v22 fixture shape: a section-scoped requires misses and pins
    // the section heading with the synthesized id the goldens pin.
    #[test]
    fn section_requires_miss_pins_the_heading() {
        let build = || {
            Contract::new().body(sections(
                LevelOpts::default(),
                vec![section_with(
                    "Summary",
                    SectionOpts {
                        rules: vec![requires(vec![pattern("outcome")])],
                        ..Default::default()
                    },
                )],
            ))
        };
        let pass = "## Summary\n\nThe outcome is recorded here.\n";
        assert_eq!(validate(pass, &build(), "d.md"), vec![]);
        let fail = "## Summary\n\nThis decision records the chosen direction.\n";
        assert_eq!(
            brief(&validate(fail, &build(), "d.md")),
            vec![(
                "text/requires/summary/1tc7itx",
                FindingLevel::Error,
                Some(1)
            )]
        );
    }

    // The v23 shape: a document-scoped forbids hit anchors at the offending line.
    #[test]
    fn doc_forbids_hit_anchors_the_offending_line() {
        let build = || {
            Contract::new()
                .body(sections(LevelOpts::default(), vec![section("Summary")]))
                .doc_rule(text_rule(TextRuleSpec {
                    forbids: vec![TextMatchSpec {
                        normalize: Some(false),
                        ..pattern("}scripts/")
                    }],
                    ..Default::default()
                }))
        };
        let fail = "## Summary\n\nCallers reach into }scripts/legacy.sh directly.\n";
        assert_eq!(
            brief(&validate(fail, &build(), "d.md")),
            vec![("text/forbids/doc/o9pijh", FindingLevel::Error, Some(3))]
        );
    }

    // Scope text is the SUBTREE: a child section's list items are in scope, at their
    // real source lines.
    #[test]
    fn scope_text_reconstruction_is_line_faithful() {
        let tree = crate::parse::parse_document(
            "## Top\n\nintro prose\n\n### Child\n\n- item one\n- item two\n\n| A | B |\n| - | - |\n| x | y |\n",
        );
        let text = section_scope_text(&tree.root.sections[0]);
        let lines: Vec<&str> = text.split('\n').collect();
        assert_eq!(lines[2], "intro prose"); // line 3
        assert_eq!(lines[6], "item one"); // line 7
        assert_eq!(lines[9], "A B"); // line 10 (table header)
        assert_eq!(lines[11], "x y"); // line 12 (data row; separator line stays empty)
    }

    #[test]
    fn code_text_starts_after_the_fence_and_on_the_line_of_indented_code() {
        let line_of_todo = |src: &str| {
            let tree = crate::parse::parse_document(src);
            let text = section_scope_text(&tree.root.sections[0]);
            text.split('\n').position(|l| l == "TODO").map(|i| i + 1)
        };
        assert_eq!(line_of_todo("## N\n\n```sh\nok\nTODO\n```\n"), Some(5));
        assert_eq!(line_of_todo("## N\n\n~~~\nTODO\n~~~\n"), Some(4));
        assert_eq!(line_of_todo("## N\n\n    ok\n    TODO\n"), Some(4));
    }

    #[test]
    #[should_panic(expected = "text-requires-purity")]
    fn requires_rejects_the_absence_form() {
        requires(vec![TextMatchSpec {
            max: Some(0.0),
            ..pattern("x")
        }]);
    }

    #[test]
    #[should_panic(expected = "invalid regex /(/")]
    fn a_bad_regex_panics_at_construction() {
        forbids(vec![TextMatchSpec {
            regex: Some("(".into()),
            ..Default::default()
        }]);
    }
}
