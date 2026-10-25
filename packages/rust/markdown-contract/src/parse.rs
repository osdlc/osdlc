//! Parsing — frontmatter split + markdown → [`DocTree`] (the projection).
//!
//! Mirrors the TS engine's `frontmatter.ts` + `projection.ts`:
//!
//! - [`split_frontmatter`] splits a leading `---` YAML block off the body **before**
//!   markdown parsing, byte-exact: `raw` is the fences-stripped inter-fence text,
//!   `body` is the verbatim tail after the closing fence's line terminator.
//! - [`parse_document`] parses the body with comrak (GFM: tables, task lists,
//!   strikethrough, autolinks, footnotes) and projects it into the section/block tree.
//!   Every position is an **absolute document line** (1-based): the body is parsed
//!   standalone and each sourcepos is shifted by the frontmatter's line count, so
//!   findings line up with the TS engine, which parses the whole document at once.
//!
//! The invariants of the TS projection hold here too: fenced code is opaque, a
//! skipped heading level attaches to the nearest ancestor with its TRUE depth preserved,
//! and only root-level blocks become section blocks — nothing is hoisted out of
//! blockquotes or list items.
//!
//! fs-free and wasm32-compatible: string in, tree out.

use comrak::nodes::{AstNode, ListType, NodeValue};
use comrak::{Arena, Options};

use crate::dialect::{extract_trailing_anchor, is_standalone_anchor};
use crate::finding::SourcePos;
use crate::frontmatter::{yaml_error, yaml_to_json};
use crate::js;
use crate::tree::{BlockNode, DocTree, Frontmatter, ListItem, SectionNode};

// ── Frontmatter split (mirrors `splitFrontmatter` / `bodyAfterFrontmatter`) ─────────

/// The result of [`split_frontmatter`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FrontmatterSplit {
    /// inter-fence YAML text, fences stripped; `None` = no frontmatter
    pub raw: Option<String>,
    /// verbatim source after the closing fence's line terminator (whole doc when none)
    pub body: String,
}

/// Is `line` (terminator already stripped) exactly a `---` fence, allowing trailing
/// spaces/tabs? Matches micromark-extension-frontmatter: exactly three markers.
fn is_fence(line: &str) -> bool {
    let line = line.strip_suffix('\r').unwrap_or(line);
    match line.strip_prefix("---") {
        Some(rest) => rest.chars().all(|c| c == ' ' || c == '\t'),
        None => false,
    }
}

/// Byte offset just past the opening fence's `\n`, iff the document opens with a fence
/// line. A fence with no line terminator cannot open a frontmatter block.
fn opening_fence_end(md: &str) -> Option<usize> {
    let eol = md.find('\n')?;
    is_fence(&md[..eol]).then_some(eol + 1)
}

/// Pure, byte-exact frontmatter/body split — no YAML parse, no projection. Same
/// recognizer as the TS `splitFrontmatter`: the opening `---` must be the very first
/// line (after a byte-order mark, which is skipped), the block must be closed by a
/// `---` line (else the whole doc is body), and `body` begins after exactly one line
/// terminator (CRLF or LF) past the closing fence.
pub fn split_frontmatter(source: &str) -> FrontmatterSplit {
    let whole = || FrontmatterSplit {
        raw: None,
        body: source.to_string(),
    };
    // micromark skips a leading U+FEFF, so a BOM does not hide the frontmatter.
    let md = source.strip_prefix('\u{feff}').unwrap_or(source);
    let Some(open_end) = opening_fence_end(md) else {
        return whole();
    };
    let mut idx = open_end;
    while idx <= md.len() {
        let (line, line_term_end) = match md[idx..].find('\n') {
            Some(i) => (&md[idx..idx + i], idx + i + 1),
            None => (&md[idx..], md.len()),
        };
        if is_fence(line) {
            // `raw` is the inter-fence text minus the line terminator before the fence.
            let mut raw_end = idx;
            if raw_end > open_end && md.as_bytes()[raw_end - 1] == b'\n' {
                raw_end -= 1;
                if raw_end > open_end && md.as_bytes()[raw_end - 1] == b'\r' {
                    raw_end -= 1;
                }
            }
            return FrontmatterSplit {
                raw: Some(md[open_end..raw_end].to_string()),
                body: md[line_term_end..].to_string(),
            };
        }
        if line_term_end >= md.len() {
            break; // last line reached without a closing fence → unclosed
        }
        idx = line_term_end;
    }
    whole()
}

// ── parse_document — the public entry point ─────────────────────────────────────────

/// Parse raw markdown (frontmatter + body) into the positioned projection. Positions in
/// the returned tree are absolute document lines, matching the TS engine. The
/// frontmatter's `data` mirrors the TS `yaml` package's `toJS()` value shape; it is
/// `None` when the YAML does not parse, and the parse error is kept for the
/// `frontmatter/yaml` finding.
pub fn parse_document(source: &str) -> DocTree {
    let split = split_frontmatter(source);
    // `body` is a suffix of `source`; the lines before it shift every body sourcepos.
    let prefix_len = source.len() - split.body.len();
    let line_offset = source[..prefix_len].bytes().filter(|&b| b == b'\n').count() as u32;

    let frontmatter = split.raw.map(|raw| {
        let (data, yaml_error) = match serde_yaml::from_str::<serde_yaml::Value>(&raw) {
            Ok(v) => (Some(yaml_to_json(v)), None),
            Err(e) => (None, Some(yaml_error(&raw, &e))),
        };
        Frontmatter {
            data,
            yaml_error,
            raw,
            pos: SourcePos::at(1, 1),
        }
    });

    // comrak does not skip a BOM, so strip it before parsing the body.
    let body = split.body.strip_prefix('\u{feff}').unwrap_or(&split.body);
    let root = project_body(body, line_offset);
    DocTree {
        frontmatter,
        body: split.body,
        root,
    }
}

// ── comrak projection ────────────────────────────────────────────────────────────────

fn gfm_options() -> Options<'static> {
    let mut options = Options::default();
    options.extension.table = true;
    options.extension.tasklist = true;
    options.extension.strikethrough = true;
    options.extension.autolink = true;
    options.extension.footnotes = true;
    options
}

fn project_body(body: &str, line_offset: u32) -> SectionNode {
    let arena = Arena::new();
    let root = comrak::parse_document(&arena, body, &gfm_options());
    let lines: Vec<&str> = body.lines().collect();
    build_tree(root, line_offset, &lines)
}

/// A node's start point as a `SourcePos` (1-based line + col), shifted to document lines.
fn pos_of<'a>(node: &'a AstNode<'a>, off: u32) -> SourcePos {
    let sp = node.data.borrow().sourcepos;
    SourcePos::at(sp.start.line as u32 + off, sp.start.column as u32)
}

/// Flatten an inline subtree to plain text, matching the TS `flattenInline`: text and
/// inline code contribute their value, a soft break stays a newline (remark keeps it
/// inside the text node), a hard break becomes a space, raw inline HTML passes through,
/// an image contributes nothing (mdast images carry `alt` out-of-band), and every other
/// container contributes its children's text.
fn flatten_inline<'a>(nodes: impl Iterator<Item = &'a AstNode<'a>>, out: &mut String) {
    for n in nodes {
        match &n.data.borrow().value {
            NodeValue::Text(t) => out.push_str(t),
            NodeValue::Code(c) => out.push_str(&c.literal),
            NodeValue::SoftBreak => out.push('\n'),
            NodeValue::LineBreak => out.push(' '),
            NodeValue::HtmlInline(h) => out.push_str(h),
            NodeValue::Image(_) => {} // remark flattens an image to nothing
            _ => flatten_inline(n.children(), out),
        }
    }
}

fn flatten_to_string<'a>(nodes: impl Iterator<Item = &'a AstNode<'a>>) -> String {
    let mut out = String::new();
    flatten_inline(nodes, &mut out);
    out
}

/// A list item's text: its paragraphs' flattened prose, joined by a space, trimmed.
fn flatten_list_item<'a>(item: &'a AstNode<'a>) -> String {
    let parts: Vec<String> = item
        .children()
        .filter(|c| matches!(c.data.borrow().value, NodeValue::Paragraph))
        .map(|c| flatten_to_string(c.children()))
        .collect();
    js::trim(&parts.join(" ")).to_string()
}

fn project_list<'a>(node: &'a AstNode<'a>, ordered: bool, off: u32) -> BlockNode {
    let items = node
        .children()
        .map(|li| {
            let checked = match &li.data.borrow().value {
                NodeValue::TaskItem(t) => Some(t.symbol.is_some()),
                _ => None,
            };
            ListItem {
                text: flatten_list_item(li),
                checked,
                pos: pos_of(li, off),
            }
        })
        .collect();
    BlockNode::List {
        ordered,
        items,
        anchor: None,
        pos: pos_of(node, off),
    }
}

fn project_code<'a>(node: &'a AstNode<'a>, off: u32) -> BlockNode {
    let (lang, value) = match &node.data.borrow().value {
        // mdast's `value` drops the final line break that comrak's `literal` keeps.
        NodeValue::CodeBlock(cb) => (
            cb.info.split_whitespace().next().map(str::to_string),
            cb.literal
                .strip_suffix('\n')
                .map(|v| v.strip_suffix('\r').unwrap_or(v))
                .unwrap_or(&cb.literal)
                .to_string(),
        ),
        _ => (None, String::new()),
    };
    BlockNode::Code {
        lang,
        value,
        anchor: None,
        pos: pos_of(node, off),
    }
}

fn project_paragraph<'a>(node: &'a AstNode<'a>, off: u32) -> BlockNode {
    BlockNode::Paragraph {
        text: js::trim(&flatten_to_string(node.children())).to_string(),
        anchor: None,
        pos: pos_of(node, off),
    }
}

/// Project a table. The header row flattens to `columns`; body rows to `rows`. GFM
/// absorbs an anchor line directly under a table as an extra row. When that last row
/// is a single cell holding only a `^block-id`, it is lifted out as the table's
/// anchor, as the TS projection does. comrak pads short rows with empty cells, so the
/// cell count is read from the row's source line (`lines` are the body's lines).
fn project_table<'a>(node: &'a AstNode<'a>, off: u32, lines: &[&str]) -> BlockNode {
    let mut columns = Vec::new();
    let mut rows: Vec<Vec<String>> = Vec::new();
    let mut row_pos = Vec::new();
    let mut last_row_line = 0usize;
    for row in node.children() {
        let is_header = matches!(row.data.borrow().value, NodeValue::TableRow(true));
        let cells: Vec<String> = row
            .children()
            .map(|c| js::trim(&flatten_to_string(c.children())).to_string())
            .collect();
        if is_header && columns.is_empty() {
            columns = cells;
        } else {
            last_row_line = row.data.borrow().sourcepos.start.line;
            row_pos.push(pos_of(row, off));
            rows.push(cells);
        }
    }

    let mut anchor = None;
    if !rows.is_empty()
        && let Some(id) = lines
            .get(last_row_line.wrapping_sub(1))
            .and_then(|line| single_cell_anchor(line))
    {
        anchor = Some(id.to_string());
        rows.pop();
        row_pos.pop();
    }

    BlockNode::Table {
        columns,
        rows,
        row_pos,
        anchor,
        pos: pos_of(node, off),
    }
}

/// The `^id` of a table row line that is one cell holding only that anchor
/// (`^id`, `| ^id`, `| ^id |`).
fn single_cell_anchor(line: &str) -> Option<&str> {
    let cell = js::trim(line);
    let cell = cell.strip_prefix('|').unwrap_or(cell);
    let cell = cell.strip_suffix('|').unwrap_or(cell);
    if cell.contains('|') {
        return None;
    }
    is_standalone_anchor(cell)
}

/// Project one root-level node to a block, or `None` when it carries no block (headings
/// are handled by the section walker; blockquotes etc. are not hoisted).
fn project_block<'a>(node: &'a AstNode<'a>, off: u32, lines: &[&str]) -> Option<BlockNode> {
    let value = &node.data.borrow().value;
    match value {
        NodeValue::Paragraph => Some(project_paragraph(node, off)),
        NodeValue::CodeBlock(_) => Some(project_code(node, off)),
        NodeValue::List(l) => Some(project_list(node, l.list_type == ListType::Ordered, off)),
        NodeValue::Table(_) => Some(project_table(node, off, lines)),
        _ => None,
    }
}

/// Strip a trailing `^id` off a paragraph or the first list item carrying one, binding it
/// as the block's anchor (Obsidian binds a block id to the block it sits in).
fn bind_trailing_anchor(block: &mut BlockNode) {
    match block {
        BlockNode::Paragraph { text, anchor, .. } => {
            if let Some(t) = extract_trailing_anchor(text) {
                *text = t.rest;
                *anchor = Some(t.id);
            }
        }
        BlockNode::List { items, anchor, .. } => {
            for item in items {
                if let Some(t) = extract_trailing_anchor(&item.text) {
                    item.text = t.rest;
                    *anchor = Some(t.id);
                    break;
                }
            }
        }
        _ => {}
    }
}

/// Bind a standalone `^id`: to the section's trailing anchor-less block, else to the
/// section itself.
fn bind_anchor(sec: &mut SectionNode, id: &str) {
    match sec.blocks.last_mut() {
        Some(last) if last.anchor().is_none() => *last.anchor_mut() = Some(id.to_string()),
        _ => sec.anchors.push(id.to_string()),
    }
}

/// Project one non-heading root node and attach its block to the current section.
fn attach_content_node<'a>(sec: &mut SectionNode, node: &'a AstNode<'a>, off: u32, lines: &[&str]) {
    let Some(mut block) = project_block(node, off, lines) else {
        return; // blockquote / nested content yields no section-level block
    };

    // A standalone `^block-id` paragraph binds to the preceding block, else the section,
    // and is itself not a content block.
    if let BlockNode::Paragraph { text, .. } = &block
        && let Some(id) = is_standalone_anchor(text)
    {
        let id = id.to_string();
        bind_anchor(sec, &id);
        return;
    }

    bind_trailing_anchor(&mut block);
    sec.blocks.push(block);
}

/// Close every open section at `depth` or deeper, attaching each popped section to its
/// parent. The root (the stack's first entry) is never popped.
fn pop_to_depth(stack: &mut Vec<SectionNode>, depth: u8) {
    while stack.len() > 1 && stack.last().expect("non-empty stack").depth >= depth {
        let done = stack.pop().expect("len > 1");
        stack.last_mut().expect("root remains").sections.push(done);
    }
}

/// Walk the flat root children, building the nested section tree: the first H1 is the
/// document title (`root.name`), a later H1 is a section of depth 1, and each other
/// heading nests under the nearest open section of smaller depth, keeping its true
/// depth.
fn build_tree<'a>(root: &'a AstNode<'a>, off: u32, lines: &[&str]) -> SectionNode {
    let doc_root = SectionNode::new("", 1, SourcePos::line(0));
    let mut title: Option<String> = None;
    let mut stack: Vec<SectionNode> = vec![doc_root];

    for node in root.children() {
        let heading = match &node.data.borrow().value {
            NodeValue::Heading(h) => Some(h.level),
            _ => None,
        };
        if let Some(level) = heading {
            let name = js::trim(&flatten_to_string(node.children())).to_string();
            if level == 1 && title.is_none() {
                // The leading H1 is the document title — captured, not a body section.
                title = Some(name);
                continue;
            }
            pop_to_depth(&mut stack, level);
            stack.push(SectionNode::new(name, level, pos_of(node, off)));
            continue;
        }
        attach_content_node(stack.last_mut().expect("non-empty stack"), node, off, lines);
    }

    pop_to_depth(&mut stack, 1); // close every open section back into the root
    let mut doc_root = stack.pop().expect("root");
    doc_root.name = title.unwrap_or_default();
    doc_root
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Contract first: a small document and its exact projection ───────────────────

    #[test]
    fn one_section_one_paragraph() {
        let tree = parse_document("## Overview\n\nPlain prose.\n");
        assert!(tree.frontmatter.is_none());
        assert_eq!(tree.root.name, "");
        assert_eq!(tree.root.sections.len(), 1);
        let sec = &tree.root.sections[0];
        assert_eq!(sec.name, "Overview");
        assert_eq!(sec.depth, 2);
        assert_eq!(sec.pos, SourcePos::at(1, 1));
        assert_eq!(
            sec.blocks,
            vec![BlockNode::Paragraph {
                text: "Plain prose.".into(),
                anchor: None,
                pos: SourcePos::at(3, 1)
            }]
        );
    }

    #[test]
    fn leading_h1_is_the_title_not_a_section() {
        let tree = parse_document("# Widget notes\n\n## Background\n\nWidgets are small.");
        assert_eq!(tree.root.name, "Widget notes");
        assert_eq!(tree.root.sections.len(), 1);
        assert_eq!(tree.root.sections[0].name, "Background");
        assert_eq!(tree.root.sections[0].pos.line, 3);
    }

    // ── Frontmatter split (mirrors the TS splitFrontmatter cases) ───────────────────

    #[test]
    fn frontmatter_splits_raw_and_verbatim_body() {
        let s = split_frontmatter("---\na: 1\n---\nbody\n");
        assert_eq!(s.raw.as_deref(), Some("a: 1"));
        assert_eq!(s.body, "body\n");
    }

    #[test]
    fn unclosed_fence_is_not_frontmatter() {
        let s = split_frontmatter("---\na: 1\nbody\n");
        assert_eq!(s.raw, None);
        assert_eq!(s.body, "---\na: 1\nbody\n");
    }

    #[test]
    fn fence_must_be_exactly_three_dashes_at_column_one() {
        assert_eq!(split_frontmatter("----\na: 1\n----\nbody\n").raw, None);
        assert_eq!(split_frontmatter(" ---\na: 1\n---\nbody\n").raw, None);
        assert_eq!(split_frontmatter("\n---\na: 1\n---\nbody\n").raw, None);
        // trailing whitespace on a fence line is tolerated (micromark behavior)
        assert_eq!(
            split_frontmatter("--- \na: 1\n--- \nbody\n").raw.as_deref(),
            Some("a: 1")
        );
    }

    #[test]
    fn empty_frontmatter_and_eof_closing_fence() {
        let s = split_frontmatter("---\n---\nbody\n");
        assert_eq!(s.raw.as_deref(), Some(""));
        assert_eq!(s.body, "body\n");
        let s = split_frontmatter("---\na: 1\n---");
        assert_eq!(s.raw.as_deref(), Some("a: 1"));
        assert_eq!(s.body, "");
    }

    #[test]
    fn crlf_frontmatter_keeps_inner_line_endings_and_strips_the_fence_terminator() {
        let s = split_frontmatter("---\r\na: 1\r\nb: 2\r\n---\r\nbody\r\n");
        assert_eq!(s.raw.as_deref(), Some("a: 1\r\nb: 2"));
        assert_eq!(s.body, "body\r\n");
    }

    #[test]
    fn dots_do_not_close_a_frontmatter_block() {
        assert_eq!(split_frontmatter("---\na: 1\n...\nbody\n").raw, None);
    }

    // ── Absolute line accounting with frontmatter (parity with remark) ──────────────

    // The 08a fixture shape: frontmatter lines 1-5, H1 line 7, ## Summary line 9 —
    // the TS engine reports absolute document lines; so do we.
    #[test]
    fn body_positions_are_absolute_document_lines() {
        let src = "---\nid: D-0099\nstatus: open/draft\ntitle: Adopt the widget protocol\n---\n\n# Adopt the widget protocol\n\n## Summary\n\nWe will adopt the widget protocol across all services.";
        let tree = parse_document(src);
        let fm = tree.frontmatter.as_ref().expect("frontmatter present");
        assert_eq!(
            fm.raw,
            "id: D-0099\nstatus: open/draft\ntitle: Adopt the widget protocol"
        );
        assert_eq!(fm.pos, SourcePos::at(1, 1));
        assert_eq!(tree.root.name, "Adopt the widget protocol");
        let sec = &tree.root.sections[0];
        assert_eq!(sec.name, "Summary");
        assert_eq!(sec.pos, SourcePos::at(9, 1));
        assert_eq!(sec.blocks[0].pos(), SourcePos::at(11, 1));
    }

    // ── Blocks: table / list / code line accounting (parity with remark) ────────────

    #[test]
    fn table_columns_rows_and_row_lines() {
        let src = "## Decision\n\n| # | Component | Resolution |\n| - | --------- | ---------- |\n| 1 | engine    | markdown-contract |";
        let tree = parse_document(src);
        let BlockNode::Table {
            columns,
            rows,
            row_pos,
            anchor,
            pos,
        } = &tree.root.sections[0].blocks[0]
        else {
            panic!("expected a table");
        };
        assert_eq!(columns, &["#", "Component", "Resolution"]);
        assert_eq!(
            rows,
            &[vec![
                "1".to_string(),
                "engine".into(),
                "markdown-contract".into()
            ]]
        );
        assert_eq!(pos.line, 3);
        assert_eq!(row_pos[0].line, 5); // body row, delimiter line skipped — remark parity
        assert_eq!(*anchor, None);
    }

    #[test]
    fn task_list_items_carry_checked_state_and_lines() {
        let src = "## Acceptance criteria\n\n- [ ] first thing\n- [x] second thing\n- plain item\n";
        let tree = parse_document(src);
        let BlockNode::List { ordered, items, .. } = &tree.root.sections[0].blocks[0] else {
            panic!("expected a list");
        };
        assert!(!ordered);
        assert_eq!(
            items
                .iter()
                .map(|i| (i.text.as_str(), i.checked, i.pos.line))
                .collect::<Vec<_>>(),
            vec![
                ("first thing", Some(false), 3),
                ("second thing", Some(true), 4),
                ("plain item", None, 5)
            ]
        );
    }

    #[test]
    fn fenced_code_is_opaque_and_keeps_its_lang() {
        let src = "## Example\n\n```ts\nconst x = 1;\n## not a heading\n```\n";
        let tree = parse_document(src);
        let sec = &tree.root.sections[0];
        assert_eq!(sec.sections.len(), 0); // the ## inside the fence is verbatim
        let BlockNode::Code {
            lang, value, pos, ..
        } = &sec.blocks[0]
        else {
            panic!("expected code");
        };
        assert_eq!(lang.as_deref(), Some("ts"));
        // As mdast does, the value drops the newline before the closing fence.
        assert_eq!(value, "const x = 1;\n## not a heading");
        assert_eq!(pos.line, 3);
    }

    // The first H1 is the title. A second H1 is a section of its own, and the H2s after
    // it are its children, as in the TS projection.
    #[test]
    fn a_second_h1_starts_a_new_top_level_section() {
        let tree = parse_document("# T1\n\n## A\n\n# T2\n\n## B\n");
        let names: Vec<_> = tree.root.sections.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(names, vec!["A", "T2"]);
        assert_eq!(tree.root.sections[1].sections[0].name, "B");
    }

    // A leading byte-order mark is not content: frontmatter still opens on line 1.
    #[test]
    fn a_leading_bom_is_skipped() {
        let tree = parse_document("\u{FEFF}---\nstatus: open\n---\n\n## A\n");
        let fm = tree.frontmatter.as_ref().expect("frontmatter");
        assert_eq!(fm.data, Some(serde_json::json!({"status": "open"})));
        assert_eq!(tree.root.sections[0].name, "A");
        assert_eq!(tree.root.sections[0].pos.line, 5);
    }

    // Only a row that is a lone `^id` in the source is lifted as the anchor.
    #[test]
    fn a_two_cell_row_with_an_anchor_is_a_data_row() {
        let src = "## T\n\n| A | B |\n| - | - |\n| 1 | 2 |\n| ^x | y |\n";
        let tree = parse_document(src);
        let BlockNode::Table { rows, anchor, .. } = &tree.root.sections[0].blocks[0] else {
            panic!("expected a table");
        };
        assert_eq!(anchor, &None);
        assert_eq!(rows.len(), 2);
    }

    // ── Anchors ──────────────────────────────────────────────────────────────────────

    #[test]
    fn paragraph_trailing_anchor_line_binds_to_the_paragraph() {
        let src = "## Summary\n\nProse line one.\n^summary\n";
        let tree = parse_document(src);
        let block = &tree.root.sections[0].blocks[0];
        assert_eq!(block.anchor(), Some("summary"));
        let BlockNode::Paragraph { text, .. } = block else {
            panic!()
        };
        assert_eq!(text, "Prose line one.");
    }

    #[test]
    fn standalone_anchor_paragraph_binds_to_the_preceding_block() {
        let src = "## Decision\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n^components\n";
        let tree = parse_document(src);
        assert_eq!(tree.root.sections[0].blocks[0].anchor(), Some("components"));
    }

    #[test]
    fn table_absorbed_anchor_row_is_lifted_out() {
        // No blank line: GFM absorbs the `^id` line as a table row; the projection
        // lifts it back out as the table's anchor (15a fixture shape).
        let src = "## Decision\n\n| # | Component | Resolution |\n| - | --------- | ---------- |\n| 1 | Projection | mdast → DocTree |\n^components\n";
        let tree = parse_document(src);
        let BlockNode::Table { rows, anchor, .. } = &tree.root.sections[0].blocks[0] else {
            panic!("expected a table");
        };
        assert_eq!(anchor.as_deref(), Some("components"));
        assert_eq!(rows.len(), 1); // the anchor row is not a data row
    }

    #[test]
    fn standalone_anchor_with_no_block_is_section_level() {
        let src = "## Summary\n\n^orphan\n";
        let tree = parse_document(src);
        assert_eq!(tree.root.sections[0].anchors, vec!["orphan".to_string()]);
        assert!(tree.root.sections[0].blocks.is_empty());
    }

    // ── Nesting: depth preserved, nearest-ancestor attach, no hoisting ──────────────

    #[test]
    fn skipped_level_attaches_to_nearest_ancestor_with_true_depth() {
        let src = "## Decision\n\nProse.\n\n#### Components\n\nDeep.\n";
        let tree = parse_document(src);
        let decision = &tree.root.sections[0];
        assert_eq!(decision.sections.len(), 1);
        assert_eq!(decision.sections[0].depth, 4); // TRUE depth, no synthesized H3
        assert_eq!(decision.sections[0].pos.line, 5);
    }

    #[test]
    fn blockquote_content_is_not_hoisted() {
        let src = "## Notes\n\n> | A |\n> | - |\n> | 1 |\n";
        let tree = parse_document(src);
        assert!(tree.root.sections[0].blocks.is_empty()); // blockquote content yields no block
    }

    #[test]
    fn multiline_paragraph_flattens_with_soft_breaks_as_newlines() {
        let src = "## Summary\n\nline one\nline two\n";
        let tree = parse_document(src);
        let BlockNode::Paragraph { text, .. } = &tree.root.sections[0].blocks[0] else {
            panic!()
        };
        assert_eq!(text, "line one\nline two");
    }

    #[test]
    fn wikilinks_survive_projection_intact() {
        let src = "## Refs\n\nsee [[D-0002]] and ![[Diagram]]\n";
        let tree = parse_document(src);
        let BlockNode::Paragraph { text, .. } = &tree.root.sections[0].blocks[0] else {
            panic!()
        };
        assert_eq!(text, "see [[D-0002]] and ![[Diagram]]");
    }
}
