//! The content plane — typed leaves over projected blocks, ported
//! finding-for-finding from the TS `content.ts`.
//!
//! [`match_content`] runs AFTER the structure plane. It walks the SAME body grammar the
//! structure plane walks, finds each declared section's `content` leaf and the block
//! that fills it, and validates that block's DATA — columns, row count, cell values,
//! list-item shape, code language, paragraph word count. Presence and kind are the
//! structure plane's kind-gate (*kind and presence are structure; data shape is
//! content*), so this plane never re-reports `structure/block-missing` /
//! `structure/block-kind`: a leaf runs only when a block of the expected kind is
//! present.
//!
//! Cell-level table findings localize to the offending row via the table's `row_pos`;
//! list-item findings pin the offending item's line; frontmatter findings are the
//! frontmatter plane's ([`crate::frontmatter::match_frontmatter`]), run first here to
//! keep the TS emission order.

use crate::contract::{
    CodeConfig, Contract, EveryItem, ExtraColumns, LeafConfig, LeafSpec, ListConfig,
    SectionContent, SectionOpts, SectionSeq, Spec, TableConfig,
};
use crate::finding::Finding;
use crate::frontmatter::match_frontmatter;
use crate::registry::{Ctx, FindingSpec};
use crate::tree::{BlockNode, DocTree, SectionNode};

// ── Spec walking (mirrors the structure plane's slot resolution) ──────────────────────

/// Unwrap `optional(spec)` to its inner spec.
fn inner_of(spec: &Spec) -> &Spec {
    match spec {
        Spec::Optional(inner) => inner_of(inner),
        other => other,
    }
}

/// The section/oneOf slots at one level that carry a `SectionOpts` (content / children /
/// rules), as `(names, opts)` pairs — the TS `contentSlots`.
fn content_slots(specs: &[Spec]) -> Vec<(&[String], &SectionOpts)> {
    let mut slots = Vec::new();
    for spec in specs {
        match inner_of(spec) {
            Spec::Section(s) => {
                if let Some(opts) = &s.opts {
                    slots.push((s.names.as_slice(), opts));
                }
            }
            Spec::OneOf(o) => {
                if let Some(opts) = &o.opts {
                    slots.push((o.names.as_slice(), opts));
                }
            }
            _ => {}
        }
    }
    slots
}

/// The first doc section at this level whose name is in `names` (first-occurrence binds).
fn find_section<'a>(nodes: &'a [SectionNode], names: &[String]) -> Option<&'a SectionNode> {
    nodes.iter().find(|n| names.contains(&n.name))
}

/// Walk one level: pair each content slot with the doc section filling it, validate that
/// section's content leaf(s), then recurse into declared children. `inherited` is the
/// nearest enclosing v2 `description` — `None` throughout v1 contracts.
fn match_level(
    nodes: &[SectionNode],
    seq: &SectionSeq,
    inherited: Option<&str>,
    ctx: &Ctx,
    out: &mut Vec<Finding>,
) {
    let level_hint = seq.description.as_deref().or(inherited);
    for (names, opts) in content_slots(&seq.specs) {
        let Some(node) = find_section(nodes, names) else {
            continue; // absence is structure's concern (structure/section-missing)
        };
        let section_hint = opts.description.as_deref().or(level_hint);
        validate_section_content(node, opts, section_hint, ctx, out);
        if let Some(children) = &opts.children {
            match_level(&node.sections, children, section_hint, ctx, out);
        }
    }
}

/// Validate a section's content leaf(s): a single leaf, or named leaves bound by `^anchor`.
fn validate_section_content(
    node: &SectionNode,
    opts: &SectionOpts,
    section_hint: Option<&str>,
    ctx: &Ctx,
    out: &mut Vec<Finding>,
) {
    match &opts.content {
        None => {}
        Some(SectionContent::Single(leaf)) => {
            validate_leaf(node, leaf, None, section_hint, ctx, out)
        }
        Some(SectionContent::Anchored(entries)) => {
            for (anchor, leaf) in entries {
                validate_leaf(node, leaf, Some(anchor.as_str()), section_hint, ctx, out);
            }
        }
    }
}

/// The block a content slot addresses: when `anchor` is set, the block carrying that
/// anchor; otherwise the section's first block.
fn pick_block<'a>(node: &'a SectionNode, anchor: Option<&str>) -> Option<&'a BlockNode> {
    match anchor {
        Some(a) => node.blocks.iter().find(|b| b.anchor() == Some(a)),
        None => node.blocks.first(),
    }
}

/// Validate one leaf against the block that fills it. The leaf runs ONLY when a block of
/// the expected kind is present: an absent block (→ `structure/block-missing`) or
/// a wrong-kind block (→ `structure/block-kind`) is the structure plane's to report.
fn validate_leaf(
    node: &SectionNode,
    leaf: &LeafSpec,
    anchor: Option<&str>,
    section_hint: Option<&str>,
    ctx: &Ctx,
    out: &mut Vec<Finding>,
) {
    let Some(block) = pick_block(node, anchor) else {
        return; // structure/block-missing
    };
    if block.kind() != leaf.kind {
        return; // structure/block-kind
    }
    let leaf_hint = leaf.description.as_deref().or(section_hint);
    match (&leaf.config, block) {
        (Some(LeafConfig::Table(cfg)), BlockNode::Table { .. }) => {
            validate_table(block, cfg, leaf_hint, ctx, out)
        }
        (Some(LeafConfig::List(cfg)), BlockNode::List { .. }) => {
            validate_list(block, cfg, leaf_hint, ctx, out)
        }
        (Some(LeafConfig::Code(cfg)), BlockNode::Code { .. }) => {
            validate_code(block, cfg, leaf_hint, ctx, out)
        }
        (Some(LeafConfig::MaxWords(max)), BlockNode::Paragraph { .. }) => {
            validate_paragraph(block, *max, leaf_hint, ctx, out)
        }
        _ => {} // no config → kind-gate only
    }
}

// ── Table ─────────────────────────────────────────────────────────────────────────────

/// Validate a `table` block's data:
///   - every declared column present                        → `content/table/column-missing`
///   - `extraColumns: "error"` for each undeclared column   → `content/table/column-extra`
///   - `minRows`                                            → `content/table/min-rows`
///   - typed `cells` over each row's value, localized to    → `content/table/cell`
///     the offending row via `row_pos`
fn validate_table(
    block: &BlockNode,
    cfg: &TableConfig,
    leaf_hint: Option<&str>,
    ctx: &Ctx,
    out: &mut Vec<Finding>,
) {
    let BlockNode::Table {
        columns,
        rows,
        row_pos,
        pos,
        ..
    } = block
    else {
        return;
    };

    // Declared columns must all be present (one finding per missing column).
    for col in &cfg.columns {
        if !columns.contains(col) {
            out.push(
                ctx.finding(
                    FindingSpec::new(
                        "content/table/column-missing",
                        format!("table is missing declared column ‘{col}’"),
                    )
                    .pos(*pos)
                    .hint_opt(leaf_hint),
                ),
            );
        }
    }

    // Extra (undeclared) columns, when locked with extraColumns: "error".
    if cfg.extra_columns == ExtraColumns::Error {
        for col in columns {
            if !cfg.columns.contains(col) {
                out.push(
                    ctx.finding(
                        FindingSpec::new(
                            "content/table/column-extra",
                            format!("table carries undeclared column ‘{col}’"),
                        )
                        .pos(*pos)
                        .hint_opt(leaf_hint),
                    ),
                );
            }
        }
    }

    // Row-count floor.
    if let Some(min_rows) = cfg.min_rows
        && (rows.len() as f64) < min_rows
    {
        out.push(
            ctx.finding(
                FindingSpec::new(
                    "content/table/min-rows",
                    format!(
                        "table has {} rows; expected at least {}",
                        rows.len(),
                        min_rows
                    ),
                )
                .pos(*pos)
                .hint_opt(leaf_hint),
            ),
        );
    }

    // Typed cells — run each declared cell schema over every row's value in that column.
    for (col, schema) in &cfg.cells {
        let Some(col_idx) = columns.iter().position(|c| c == col) else {
            continue; // a declared cell on a missing column → column-missing covers it
        };
        let cell_hint = crate::schema::schema_root_description(schema).or(leaf_hint);
        for (i, row) in rows.iter().enumerate() {
            let value = row.get(col_idx).cloned().unwrap_or_default();
            let json = serde_json::Value::String(value.clone());
            if schema.safe_parse(Some(&json)).is_err() {
                let mut spec = FindingSpec::new(
                    "content/table/cell",
                    format!("cell ‘{value}’ in column ‘{col}’ is invalid"),
                )
                .hint_opt(cell_hint);
                if let Some(pos) = row_pos.get(i) {
                    spec = spec.pos(*pos); // localize to the offending row
                }
                out.push(ctx.finding(spec));
            }
        }
    }
}

// ── List ──────────────────────────────────────────────────────────────────────────────

/// Validate a `list` block's data:
///   - `everyItem: checkbox` → every item carries `checked`, else `content/list/item-kind`
///     per offending item (pinned to the item's source line)
///   - `everyItem: <schema>` → the schema over each item's text → `content/list/item-kind`
///   - `minItems`            → item-count floor → `content/list/min-items`
fn validate_list(
    block: &BlockNode,
    cfg: &ListConfig,
    leaf_hint: Option<&str>,
    ctx: &Ctx,
    out: &mut Vec<Finding>,
) {
    let BlockNode::List { items, pos, .. } = block else {
        return;
    };

    match &cfg.every_item {
        Some(EveryItem::Checkbox) => {
            for item in items {
                if item.checked.is_none() {
                    out.push(
                        ctx.finding(
                            FindingSpec::new(
                                "content/list/item-kind",
                                "list item is not a checkbox (‘- [ ]’ / ‘- [x]’)",
                            )
                            .pos(item.pos)
                            .hint_opt(leaf_hint),
                        ),
                    );
                }
            }
        }
        Some(EveryItem::Schema(schema)) => {
            let item_hint = crate::schema::schema_root_description(schema).or(leaf_hint);
            for item in items {
                let json = serde_json::Value::String(item.text.clone());
                if schema.safe_parse(Some(&json)).is_err() {
                    out.push(
                        ctx.finding(
                            FindingSpec::new(
                                "content/list/item-kind",
                                format!("list item ‘{}’ is invalid", item.text),
                            )
                            .pos(item.pos)
                            .hint_opt(item_hint),
                        ),
                    );
                }
            }
        }
        None => {}
    }

    if let Some(min_items) = cfg.min_items
        && (items.len() as f64) < min_items
    {
        out.push(
            ctx.finding(
                FindingSpec::new(
                    "content/list/min-items",
                    format!(
                        "list has {} items; expected at least {}",
                        items.len(),
                        min_items
                    ),
                )
                .pos(*pos)
                .hint_opt(leaf_hint),
            ),
        );
    }
}

// ── Code ──────────────────────────────────────────────────────────────────────────────

/// Validate a `code` block's language matches the declared `lang` → `content/code/lang`.
fn validate_code(
    block: &BlockNode,
    cfg: &CodeConfig,
    leaf_hint: Option<&str>,
    ctx: &Ctx,
    out: &mut Vec<Finding>,
) {
    let BlockNode::Code { lang, pos, .. } = block else {
        return;
    };
    let Some(required) = &cfg.lang else {
        return;
    };
    if lang.as_deref() != Some(required.as_str()) {
        out.push(
            ctx.finding(
                FindingSpec::new(
                    "content/code/lang",
                    format!(
                        "code block language ‘{}’ does not match required ‘{required}’",
                        lang.as_deref().unwrap_or("(none)")
                    ),
                )
                .pos(*pos)
                .hint_opt(leaf_hint),
            ),
        );
    }
}

// ── Paragraph (maxWords) ──────────────────────────────────────────────────────────────

/// Validate a `paragraph` block's word count ≤ `maxWords` → `content/max-words`.
fn validate_paragraph(
    block: &BlockNode,
    max_words: f64,
    leaf_hint: Option<&str>,
    ctx: &Ctx,
    out: &mut Vec<Finding>,
) {
    let BlockNode::Paragraph { text, pos, .. } = block else {
        return;
    };
    let words = text.split_whitespace().count();
    if (words as f64) > max_words {
        out.push(
            ctx.finding(
                FindingSpec::new(
                    "content/max-words",
                    format!("paragraph runs to {words} words; expected at most {max_words}"),
                )
                .pos(*pos)
                .hint_opt(leaf_hint),
            ),
        );
    }
}

// ── Public entry ──────────────────────────────────────────────────────────────────────

/// Run the content plane: the frontmatter schema (if declared) plus every section's
/// content leaf. Returns findings in emission order; `validate` applies the
/// deterministic cross-plane sort.
pub fn match_content(tree: &DocTree, contract: &Contract, ctx: &Ctx) -> Vec<Finding> {
    let mut out = Vec::new();
    if let Some(fm) = &contract.frontmatter {
        match_frontmatter(tree, &fm.schema, ctx, &mut out);
    }
    if let Some(body) = &contract.body {
        match_level(&tree.root.sections, body, None, ctx, &mut out);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::{LevelOpts, SectionOpts, section_with, sections};
    use crate::finding::FindingLevel;
    use crate::schema::Schema;
    use crate::validate::validate;

    fn brief(findings: &[Finding]) -> Vec<(&str, FindingLevel, Option<u32>)> {
        findings
            .iter()
            .map(|f| (f.id.as_str(), f.level, f.pos.map(|p| p.line)))
            .collect()
    }

    fn table_contract(cfg: TableConfig) -> Contract {
        Contract::new().body(sections(
            LevelOpts::default(),
            vec![section_with(
                "Files",
                SectionOpts {
                    content: Some(SectionContent::Single(LeafSpec::table_with(cfg))),
                    ..Default::default()
                },
            )],
        ))
    }

    // Contract first: a conforming table is silent; each violated check fires its id.
    #[test]
    fn table_columns_min_rows_and_extras() {
        let cfg = || TableConfig {
            columns: vec!["Location".into(), "Kind".into(), "Change".into()],
            min_rows: Some(1.0),
            extra_columns: ExtraColumns::Error,
            ..Default::default()
        };
        let pass =
            "## Files\n\n| Location | Kind | Change |\n| - | - | - |\n| a.ts | add | new |\n";
        assert_eq!(validate(pass, &table_contract(cfg()), "t.md"), vec![]);

        // Missing declared column + below minRows, both at the table header (line 3).
        let fail = "## Files\n\n| Location | Kind |\n| - | - |\n";
        assert_eq!(
            brief(&validate(fail, &table_contract(cfg()), "t.md")),
            vec![
                ("content/table/column-missing", FindingLevel::Error, Some(3)),
                ("content/table/min-rows", FindingLevel::Error, Some(3)),
            ]
        );

        // An undeclared column under extraColumns: error.
        let extra = "## Files\n\n| Location | Kind | Change | Owner |\n| - | - | - | - |\n| a.ts | add | new | bob |\n";
        assert_eq!(
            brief(&validate(extra, &table_contract(cfg()), "t.md")),
            vec![("content/table/column-extra", FindingLevel::Error, Some(3))]
        );
    }

    // Typed cells localize to the offending ROW (the 11a fixture shape).
    #[test]
    fn typed_cell_violation_pins_the_offending_row() {
        let cfg = TableConfig {
            columns: vec!["Location".into(), "Kind".into()],
            cells: vec![(
                "Kind".into(),
                Schema::Enum(vec!["add".into(), "modify".into(), "delete".into()]),
            )],
            ..Default::default()
        };
        let fail =
            "## Files\n\n| Location | Kind |\n| - | - |\n| a.ts | add |\n| b.ts | rename |\n";
        assert_eq!(
            brief(&validate(fail, &table_contract(cfg), "t.md")),
            vec![("content/table/cell", FindingLevel::Error, Some(6))]
        );
    }

    fn list_contract(cfg: ListConfig) -> Contract {
        Contract::new().body(sections(
            LevelOpts::default(),
            vec![section_with(
                "Acceptance criteria",
                SectionOpts {
                    content: Some(SectionContent::Single(LeafSpec::list_with(cfg))),
                    ..Default::default()
                },
            )],
        ))
    }

    #[test]
    fn checkbox_gate_and_min_items() {
        let cfg = || ListConfig {
            every_item: Some(EveryItem::Checkbox),
            min_items: Some(2.0),
            ..Default::default()
        };
        let pass = "## Acceptance criteria\n\n- [ ] one\n- [x] two\n";
        assert_eq!(validate(pass, &list_contract(cfg()), "l.md"), vec![]);

        // A bare bullet on line 4; below the floor pins the list head (line 3).
        let fail = "## Acceptance criteria\n\n- [ ] one\n- bare bullet\n";
        assert_eq!(
            brief(&validate(fail, &list_contract(cfg()), "l.md")),
            vec![("content/list/item-kind", FindingLevel::Error, Some(4))]
        );
        let short = "## Acceptance criteria\n\n- [ ] only one\n";
        assert_eq!(
            brief(&validate(short, &list_contract(cfg()), "l.md")),
            vec![("content/list/min-items", FindingLevel::Error, Some(3))]
        );
    }

    #[test]
    fn every_item_schema_runs_over_item_text() {
        let cfg = ListConfig {
            every_item: Some(EveryItem::Schema(Schema::String {
                min: Some(5.0),
                max: None,
                pattern: None,
            })),
            ..Default::default()
        };
        let fail = "## Acceptance criteria\n\n- long enough item\n- tiny\n";
        assert_eq!(
            brief(&validate(fail, &list_contract(cfg), "l.md")),
            vec![("content/list/item-kind", FindingLevel::Error, Some(4))]
        );
    }

    #[test]
    fn code_lang_and_max_words() {
        let code = Contract::new().body(sections(
            LevelOpts::default(),
            vec![section_with(
                "Example",
                SectionOpts {
                    content: Some(SectionContent::Single(LeafSpec::code_with(CodeConfig {
                        lang: Some("ts".into()),
                    }))),
                    ..Default::default()
                },
            )],
        ));
        let fail = "## Example\n\n```python\nx = 1\n```\n";
        assert_eq!(
            brief(&validate(fail, &code, "c.md")),
            vec![("content/code/lang", FindingLevel::Error, Some(3))]
        );

        let prose = Contract::new().body(sections(
            LevelOpts::default(),
            vec![section_with(
                "Summary",
                SectionOpts {
                    content: Some(SectionContent::Single(LeafSpec::max_words(3.0))),
                    ..Default::default()
                },
            )],
        ));
        let fail = "## Summary\n\nfour words are here\n";
        assert_eq!(
            brief(&validate(fail, &prose, "p.md")),
            vec![("content/max-words", FindingLevel::Error, Some(3))]
        );
    }

    // An absent or wrong-kind block is structure's finding; content stays silent.
    #[test]
    fn content_defers_to_the_structure_kind_gate() {
        let c = table_contract(TableConfig {
            columns: vec!["A".into()],
            min_rows: Some(1.0),
            ..Default::default()
        });
        let wrong_kind = "## Files\n\nJust prose.\n";
        assert_eq!(
            brief(&validate(wrong_kind, &c, "t.md")),
            vec![("structure/block-kind", FindingLevel::Error, Some(3))]
        );
    }
}
