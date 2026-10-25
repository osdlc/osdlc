//! The projected document substrate — `DocTree` / `SectionNode` / `BlockNode`.
//!
//! The tree every plane reads: flat headings become a nested section tree (the first
//! H1 is the document title; H2s and any later H1 are top-level sections; deeper
//! headings nest by depth),
//! blocks are flattened (table cells → strings, list items → text, code verbatim,
//! paragraph text flattened), each carrying a 1-based source position. `^block-id`
//! anchors bind to blocks (`BlockNode` anchor) or sections (`SectionNode::anchors`).
//!
//! This module is data-only; the comrak projection that builds it lives in
//! [`crate::parse`].

use crate::finding::SourcePos;

/// The block kinds the structure plane's kind-gate distinguishes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(missing_docs)]
pub enum BlockKind {
    Table,
    List,
    /// A fenced or indented code block.
    Code,
    Paragraph,
}

impl std::fmt::Display for BlockKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            BlockKind::Table => "table",
            BlockKind::List => "list",
            BlockKind::Code => "code",
            BlockKind::Paragraph => "paragraph",
        })
    }
}

/// One list item: flattened text, task-list checkbox state (when present), source position.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ListItem {
    /// the item text
    pub text: String,
    /// `Some` for a task-list item: whether it is checked
    pub checked: Option<bool>,
    /// where the item starts
    pub pos: SourcePos,
}

/// A flattened content block directly under a section heading.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BlockNode {
    /// A table.
    Table {
        /// the header cells
        columns: Vec<String>,
        /// the body rows, as cell text
        rows: Vec<Vec<String>>,
        /// body-row index → source position (the TS `rowPos(i)` closure, as data)
        row_pos: Vec<SourcePos>,
        /// the `^block-id` bound to the table, if any
        anchor: Option<String>,
        /// where the table starts
        pos: SourcePos,
    },
    /// A list.
    List {
        /// whether the list is ordered
        ordered: bool,
        /// the items
        items: Vec<ListItem>,
        /// the `^block-id` bound to the list, if any
        anchor: Option<String>,
        /// where the list starts
        pos: SourcePos,
    },
    /// A fenced or indented code block.
    Code {
        /// the info-string language, if any
        lang: Option<String>,
        /// the code, without the fences
        value: String,
        /// `true` for a fenced block, whose `value` starts on the line after `pos`; an
        /// indented block's `value` starts on `pos.line`
        fenced: bool,
        /// the `^block-id` bound to the block, if any
        anchor: Option<String>,
        /// where the block starts
        pos: SourcePos,
    },
    /// A paragraph.
    Paragraph {
        /// the paragraph text
        text: String,
        /// the `^block-id` bound to the paragraph, if any
        anchor: Option<String>,
        /// where the paragraph starts
        pos: SourcePos,
    },
}

impl BlockNode {
    /// The kind of block.
    pub fn kind(&self) -> BlockKind {
        match self {
            BlockNode::Table { .. } => BlockKind::Table,
            BlockNode::List { .. } => BlockKind::List,
            BlockNode::Code { .. } => BlockKind::Code,
            BlockNode::Paragraph { .. } => BlockKind::Paragraph,
        }
    }

    /// Where the block starts.
    pub fn pos(&self) -> SourcePos {
        match self {
            BlockNode::Table { pos, .. }
            | BlockNode::List { pos, .. }
            | BlockNode::Code { pos, .. }
            | BlockNode::Paragraph { pos, .. } => *pos,
        }
    }

    /// The `^block-id` bound to the block, if any.
    pub fn anchor(&self) -> Option<&str> {
        match self {
            BlockNode::Table { anchor, .. }
            | BlockNode::List { anchor, .. }
            | BlockNode::Code { anchor, .. }
            | BlockNode::Paragraph { anchor, .. } => anchor.as_deref(),
        }
    }

    pub(crate) fn anchor_mut(&mut self) -> &mut Option<String> {
        match self {
            BlockNode::Table { anchor, .. }
            | BlockNode::List { anchor, .. }
            | BlockNode::Code { anchor, .. }
            | BlockNode::Paragraph { anchor, .. } => anchor,
        }
    }
}

/// A heading-delimited section: exact heading text, TRUE heading depth (a skipped level
/// is preserved, not synthesized), heading position, nested subsections,
/// heading-direct blocks (no hoisting), and section-level anchors.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SectionNode {
    /// heading text, trimmed (exact, case-sensitive)
    pub name: String,
    /// 1..6 (the synthetic root is depth 1)
    pub depth: u8,
    /// the heading's position
    pub pos: SourcePos,
    /// nested subsections
    pub sections: Vec<SectionNode>,
    /// blocks directly under the heading
    pub blocks: Vec<BlockNode>,
    /// section-level `^block-id`s (block-bound ids live on the block)
    pub anchors: Vec<String>,
}

impl SectionNode {
    /// The block a content slot reads: the block bound to `anchor` when one is given,
    /// else the section's first block.
    pub(crate) fn block_for(&self, anchor: Option<&str>) -> Option<&BlockNode> {
        match anchor {
            Some(a) => self.blocks.iter().find(|b| b.anchor() == Some(a)),
            None => self.blocks.first(),
        }
    }

    pub(crate) fn new(name: impl Into<String>, depth: u8, pos: SourcePos) -> Self {
        Self {
            name: name.into(),
            depth,
            pos,
            sections: Vec::new(),
            blocks: Vec::new(),
            anchors: Vec::new(),
        }
    }
}

/// The frontmatter block. `data` is the parsed YAML in the JSON value shape the TS
/// `yaml` package's `toJS()` gives, or `None` when the YAML does not parse. `pos` is
/// the opening `---` fence (line 1). The frontmatter plane finds the line of a key, and
/// the error of YAML that does not parse, by reading `raw`.
#[derive(Debug, Clone, PartialEq)]
pub struct Frontmatter {
    /// inter-fence YAML text, fences stripped
    pub raw: String,
    /// the parsed YAML, or `None` when it does not parse
    pub data: Option<serde_json::Value>,
    /// the opening `---` fence
    pub pos: SourcePos,
}

/// The projected document: the frontmatter block (when present), the verbatim body
/// after it, and the synthetic root whose `sections` are the top-level H2s and whose
/// `name` is the leading-H1 title.
#[derive(Debug, Clone, PartialEq)]
pub struct DocTree {
    /// the leading `---` YAML block, position-aware; `None` when absent
    pub frontmatter: Option<Frontmatter>,
    /// verbatim source body after the frontmatter block (the whole doc when none)
    pub body: String,
    /// synthetic root (depth 1); `root.sections` are the top-level body sections
    pub root: SectionNode,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn block_kind_displays_as_the_ts_kind_strings() {
        assert_eq!(BlockKind::Table.to_string(), "table");
        assert_eq!(BlockKind::List.to_string(), "list");
        assert_eq!(BlockKind::Code.to_string(), "code");
        assert_eq!(BlockKind::Paragraph.to_string(), "paragraph");
    }

    #[test]
    fn block_node_exposes_kind_pos_and_anchor_uniformly() {
        let b = BlockNode::Paragraph {
            text: "hello".into(),
            anchor: Some("summary".into()),
            pos: SourcePos::at(3, 1),
        };
        assert_eq!(b.kind(), BlockKind::Paragraph);
        assert_eq!(b.pos(), SourcePos::at(3, 1));
        assert_eq!(b.anchor(), Some("summary"));
    }
}
