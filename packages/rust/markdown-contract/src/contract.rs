//! The contract model + builder API — programmatic construction of the
//! body grammar the structure plane matches, mirroring the TS `section()` / `optional()`
//! / `oneOf()` / `gap()` / `sections()` combinators.
//!
//! This is also the **programmatic rule seam**: the [`Rule`] (node-scoped) and
//! [`DocRule`] (doc-scoped) traits mirror the TS `rule` / `docRule` escapes and are
//! invoked during validation — node rules per declared, present section, doc rules over
//! the whole projected tree.
//!
//! Content-plane data rides here too: [`Contract::frontmatter`] carries the compiled
//! [`Schema`] the frontmatter plane runs, and [`LeafSpec::config`] carries the typed
//! [`LeafConfig`] (columns / minRows / cells / everyItem / lang / maxWords) the content
//! plane interprets. The structure plane still reads only `LeafSpec::kind` (the
//! kind-gate); the data checks live in [`crate::content`].

use crate::finding::Finding;
use crate::registry::Ctx;
use crate::schema::Schema;
use crate::tree::{BlockKind, DocTree, SectionNode};

// ── Rules: the programmatic escape (mirrors TS `rule` / `docRule`) ──────────────────

/// A node-scoped named rule, run against each declared, present section that carries it.
pub trait Rule {
    /// The rule's id, used in the findings it makes.
    fn id(&self) -> &str;
    /// Check one section and return its findings.
    fn run(&self, node: &SectionNode, ctx: &Ctx) -> Vec<Finding>;
}

/// A doc-scoped named rule, run once over the whole projected tree.
pub trait DocRule {
    /// The rule's id, used in the findings it makes.
    fn id(&self) -> &str;
    /// Check the whole document and return its findings.
    fn run(&self, tree: &DocTree, ctx: &Ctx) -> Vec<Finding>;
}

struct FnRule<F> {
    id: String,
    f: F,
}

impl<F> Rule for FnRule<F>
where
    F: Fn(&SectionNode, &Ctx) -> Vec<Finding>,
{
    fn id(&self) -> &str {
        &self.id
    }
    fn run(&self, node: &SectionNode, ctx: &Ctx) -> Vec<Finding> {
        (self.f)(node, ctx)
    }
}

struct FnDocRule<F> {
    id: String,
    f: F,
}

impl<F> DocRule for FnDocRule<F>
where
    F: Fn(&DocTree, &Ctx) -> Vec<Finding>,
{
    fn id(&self) -> &str {
        &self.id
    }
    fn run(&self, tree: &DocTree, ctx: &Ctx) -> Vec<Finding> {
        (self.f)(tree, ctx)
    }
}

/// A per-node named rule from a closure — the TS `rule(id, fn)`.
pub fn rule<F>(id: impl Into<String>, f: F) -> Box<dyn Rule>
where
    F: Fn(&SectionNode, &Ctx) -> Vec<Finding> + 'static,
{
    Box::new(FnRule { id: id.into(), f })
}

/// A doc-scoped named rule from a closure — the TS `docRule(id, fn)`.
pub fn doc_rule<F>(id: impl Into<String>, f: F) -> Box<dyn DocRule>
where
    F: Fn(&DocTree, &Ctx) -> Vec<Finding> + 'static,
{
    Box::new(FnDocRule { id: id.into(), f })
}

// ── Leaves & section options ─────────────────────────────────────────────────────────

/// Whether undeclared table columns are tolerated or reported (`content/table/column-extra`).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum ExtraColumns {
    /// Extra columns are allowed.
    #[default]
    Ignore,
    /// Extra columns give a finding.
    Error,
}

/// A `table(...)` leaf's content config — the TS `TableConfig`.
#[derive(Debug, Clone, Default)]
pub struct TableConfig {
    /// the column headings the table must have (their order is not checked)
    pub columns: Vec<String>,
    /// parsed for parity with TS and unused; a table is bound to an anchor by its
    /// [`SectionContent::Anchored`] key
    pub anchor: Option<String>,
    /// the fewest body rows allowed
    pub min_rows: Option<f64>,
    /// per-column typed cells, in declaration order
    pub cells: Vec<(String, Schema)>,
    /// what to do with columns the contract does not name
    pub extra_columns: ExtraColumns,
}

/// A list leaf's per-item check — the checkbox gate, or a schema over each item's text.
#[derive(Debug, Clone)]
pub enum EveryItem {
    /// every item must be a task-list checkbox
    Checkbox,
    /// every item's text must satisfy the schema
    Schema(Schema),
}

/// A `list(...)` leaf's content config, the TS `ListConfig`.
#[derive(Debug, Clone, Default)]
pub struct ListConfig {
    /// parsed for parity with TS and unused: neither engine checks it
    pub ordered: Option<bool>,
    /// the check applied to each item
    pub every_item: Option<EveryItem>,
    /// the fewest items allowed
    pub min_items: Option<f64>,
}

/// A `code(...)` leaf's content config — the TS `CodeConfig`.
#[derive(Debug, Clone, Default)]
pub struct CodeConfig {
    /// the required code-fence language
    pub lang: Option<String>,
}

/// The content checks a leaf carries: what the TS builders put on `LeafSpec.config`,
/// with cell and item schemas compiled.
#[derive(Debug, Clone)]
#[allow(missing_docs)]
pub enum LeafConfig {
    Table(TableConfig),
    List(ListConfig),
    Code(CodeConfig),
    /// The most words a paragraph in the section may have, the TS `maxWords(n)`.
    MaxWords(f64),
}

/// A content leaf: the structural kind-gate (checked by the structure plane) plus the
/// typed `config` the content plane interprets.
#[derive(Debug, Clone)]
pub struct LeafSpec {
    /// the block kind that fills the leaf
    pub kind: BlockKind,
    /// the leaf's content config; `None` = kind-gate only (no data checks)
    pub config: Option<LeafConfig>,
    /// the leaf's `description:`, carried for `Finding.hint`
    pub description: Option<String>,
}

impl LeafSpec {
    /// A leaf of the given kind with no content checks.
    pub fn new(kind: BlockKind) -> Self {
        Self {
            kind,
            config: None,
            description: None,
        }
    }

    /// A table leaf with no data checks (kind-gate only).
    pub fn table() -> Self {
        Self::new(BlockKind::Table)
    }

    /// A table leaf with content checks — the TS `table({...})`.
    pub fn table_with(config: TableConfig) -> Self {
        Self {
            kind: BlockKind::Table,
            config: Some(LeafConfig::Table(config)),
            description: None,
        }
    }

    /// A list leaf with no data checks (kind-gate only).
    pub fn list() -> Self {
        Self::new(BlockKind::List)
    }

    /// A list leaf with content checks — the TS `list({...})`.
    pub fn list_with(config: ListConfig) -> Self {
        Self {
            kind: BlockKind::List,
            config: Some(LeafConfig::List(config)),
            description: None,
        }
    }

    /// A code leaf with no data checks (kind-gate only).
    pub fn code() -> Self {
        Self::new(BlockKind::Code)
    }

    /// A code leaf pinned to a language — the TS `code({ lang })`.
    pub fn code_with(config: CodeConfig) -> Self {
        Self {
            kind: BlockKind::Code,
            config: Some(LeafConfig::Code(config)),
            description: None,
        }
    }

    /// A paragraph leaf (kind-gate only).
    pub fn paragraph() -> Self {
        Self::new(BlockKind::Paragraph)
    }

    /// A paragraph leaf bounding word count — the TS `maxWords(n)`.
    pub fn max_words(n: f64) -> Self {
        Self {
            kind: BlockKind::Paragraph,
            config: Some(LeafConfig::MaxWords(n)),
            description: None,
        }
    }
}

/// A section's content declaration: a single leaf, or named leaves bound by `^anchor`.
pub enum SectionContent {
    /// one leaf for the section
    Single(LeafSpec),
    /// `(anchor, leaf)` pairs, in declaration order
    Anchored(Vec<(String, LeafSpec)>),
}

/// Per-section options — the TS `SectionOpts`.
#[derive(Default)]
pub struct SectionOpts {
    /// whether the section may be absent
    pub optional: bool,
    /// what the section's blocks must be
    pub content: Option<SectionContent>,
    /// nested subsequence (recursion)
    pub children: Option<SectionSeq>,
    /// node-local named rules
    pub rules: Vec<Box<dyn Rule>>,
    /// require a `^block-id`, e.g. `"summary"`
    pub anchor: Option<String>,
    /// repeatable slot: the declared heading may recur as peers at one level
    pub repeatable: bool,
    /// minimum occurrence count for a repeatable slot (below → `structure/repeat-count`)
    pub min: Option<usize>,
    /// maximum occurrence count for a repeatable slot (above → `structure/repeat-count`)
    pub max: Option<usize>,
    /// the node's `description:`, carried for `Finding.hint`
    pub description: Option<String>,
}

// ── The level grammar ─────────────────────────────────────────────────────────────────

/// `order` and `allow_unknown` are independent knobs over a level's content model.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Order {
    /// headings may come in any order
    None,
    /// declared headings that are present keep their declared order
    RecognizedRelative,
    /// declared headings come in exactly the declared order
    Strict,
}

/// A level's options; defaults mirror the TS engine (`order: "none"`, `allowUnknown: true`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LevelOpts {
    /// how declared sections are ordered
    pub order: Order,
    /// whether sections the contract does not declare are allowed
    pub allow_unknown: bool,
}

impl Default for LevelOpts {
    fn default() -> Self {
        Self {
            order: Order::None,
            allow_unknown: true,
        }
    }
}

/// A declared section slot: the heading and its aliases, plus options.
pub struct SectionSpec {
    /// the heading first, then its aliases; a document may use exactly one of them
    pub names: Vec<String>,
    #[allow(missing_docs)]
    pub opts: Option<SectionOpts>,
}

/// A `oneOf` slot: exactly one of several headings must appear.
pub struct OneOfSpec {
    /// the headings, one of which must appear
    pub names: Vec<String>,
    #[allow(missing_docs)]
    pub opts: Option<SectionOpts>,
}

/// A `gap()` window admitting unknown sections, optionally bounded.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct GapSpec {
    /// the fewest unknown sections admitted
    pub min: Option<usize>,
    /// the most unknown sections admitted
    pub max: Option<usize>,
}

/// One element of a level's ordered content model — the output of the builder functions.
pub enum Spec {
    /// a declared section
    Section(SectionSpec),
    /// a slot that may be absent
    Optional(Box<Spec>),
    /// one slot with several accepted spellings
    OneOf(OneOfSpec),
    /// a window for unknown sections
    Gap(GapSpec),
}

impl Spec {
    /// The spec inside any `optional(...)` wrappers, and whether there was one.
    pub(crate) fn unwrap_optional(&self) -> (&Spec, bool) {
        match self {
            Spec::Optional(inner) => (inner.unwrap_optional().0, true),
            other => (other, false),
        }
    }
}

/// The body grammar of one level — the output of [`sections`].
#[derive(Default)]
pub struct SectionSeq {
    /// the level's order and unknown-section options
    pub opts: LevelOpts,
    /// the level's slots, in declaration order
    pub specs: Vec<Spec>,
    /// the level's `description:`; only the body root has one, since a nested level's
    /// description is its section node's
    pub description: Option<String>,
}

// ── Builders (mirror the TS combinators) ─────────────────────────────────────────────

/// A required section with a single exact heading — `section("Overview")`.
pub fn section(name: impl Into<String>) -> Spec {
    Spec::Section(SectionSpec {
        names: vec![name.into()],
        opts: None,
    })
}

/// A section with options — `section("Summary", { anchor: "summary", … })`.
pub fn section_with(name: impl Into<String>, opts: SectionOpts) -> Spec {
    Spec::Section(SectionSpec {
        names: vec![name.into()],
        opts: Some(opts),
    })
}

/// One required slot with several interchangeable spellings — `oneOf([...])`.
pub fn one_of<I, S>(names: I) -> Spec
where
    I: IntoIterator<Item = S>,
    S: Into<String>,
{
    Spec::OneOf(OneOfSpec {
        names: names.into_iter().map(Into::into).collect(),
        opts: None,
    })
}

/// A `oneOf` slot with options.
pub fn one_of_with<I, S>(names: I, opts: SectionOpts) -> Spec
where
    I: IntoIterator<Item = S>,
    S: Into<String>,
{
    Spec::OneOf(OneOfSpec {
        names: names.into_iter().map(Into::into).collect(),
        opts: Some(opts),
    })
}

/// Mark a spec optional — `optional(section("Appendix"))`.
pub fn optional(spec: Spec) -> Spec {
    Spec::Optional(Box::new(spec))
}

/// An unbounded gap window admitting unknown sections.
pub fn gap() -> Spec {
    Spec::Gap(GapSpec::default())
}

/// A bounded gap window — `gap({ min, max })`.
pub fn gap_bounds(min: Option<usize>, max: Option<usize>) -> Spec {
    Spec::Gap(GapSpec { min, max })
}

/// A level's ordered content model — `sections(opts, [ … ])`.
pub fn sections(opts: LevelOpts, specs: Vec<Spec>) -> SectionSeq {
    SectionSeq {
        opts,
        specs,
        description: None,
    }
}

// ── The contract ──────────────────────────────────────────────────────────────────────

/// The frontmatter plane's compiled schema — an object [`Schema`] the plane runs over
/// the parsed frontmatter data (the TS contract's `frontmatter` Zod object).
#[derive(Debug, Clone)]
pub struct FrontmatterSpec {
    /// the object schema
    pub schema: Schema,
}

/// A compiled contract for one markdown class: frontmatter schema, body grammar, and
/// doc-scoped rules.
#[derive(Default)]
pub struct Contract {
    /// validated by the frontmatter plane (`frontmatter/*` findings)
    pub frontmatter: Option<FrontmatterSpec>,
    /// the heading grammar of the document body
    pub body: Option<SectionSeq>,
    /// cross-plane rules over the whole projected tree
    pub rules: Vec<Box<dyn DocRule>>,
    /// the contract root's `description:`, the `Finding.hint` of a finding with no
    /// nearer description in scope
    pub description: Option<String>,
}

impl Contract {
    /// An empty contract: no frontmatter schema, no body grammar and no rules.
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the body grammar.
    pub fn body(mut self, body: SectionSeq) -> Self {
        self.body = Some(body);
        self
    }

    /// Attach a doc-scoped rule.
    pub fn doc_rule(mut self, rule: Box<dyn DocRule>) -> Self {
        self.rules.push(rule);
        self
    }

    /// Set the frontmatter schema.
    pub fn frontmatter(mut self, spec: FrontmatterSpec) -> Self {
        self.frontmatter = Some(spec);
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::finding::SourcePos;
    use crate::registry::{FindingSpec, Registry};

    // Contract first: the builder assembles the same shapes the TS combinators produce.
    #[test]
    fn builders_assemble_the_grammar() {
        let seq = sections(
            LevelOpts {
                order: Order::Strict,
                allow_unknown: false,
            },
            vec![
                section("Title"),
                one_of(["Goal", "Goal / Problem statement"]),
                gap_bounds(Some(1), Some(2)),
                optional(section("Appendix")),
            ],
        );
        assert_eq!(seq.specs.len(), 4);
        let Spec::Section(s) = &seq.specs[0] else {
            panic!("expected a section")
        };
        assert_eq!(s.names, vec!["Title"]);
        let Spec::OneOf(o) = &seq.specs[1] else {
            panic!("expected a oneOf")
        };
        assert_eq!(o.names.len(), 2);
        let Spec::Gap(g) = &seq.specs[2] else {
            panic!("expected a gap")
        };
        assert_eq!((g.min, g.max), (Some(1), Some(2)));
        let Spec::Optional(inner) = &seq.specs[3] else {
            panic!("expected optional")
        };
        assert!(matches!(**inner, Spec::Section(_)));
    }

    #[test]
    fn max_words_is_a_paragraph_kind_leaf() {
        // `maxWords(n)` gates on a paragraph; the bound itself is content-plane config.
        assert_eq!(LeafSpec::max_words(120.0).kind, BlockKind::Paragraph);
        assert_eq!(LeafSpec::table().kind, BlockKind::Table);
    }

    #[test]
    fn a_closure_rule_runs_against_a_node_and_mints_via_ctx() {
        let r = rule("summary/mentions-outcome", |node, ctx| {
            vec![
                ctx.finding(
                    FindingSpec::new(
                        "summary/mentions-outcome",
                        "Summary must mention the outcome",
                    )
                    .pos(node.pos),
                ),
            ]
        });
        let registry = Registry::default();
        let ctx = Ctx::new("doc.md", &registry);
        let node = SectionNode::new("Summary", 2, SourcePos::at(1, 1));
        let out = r.run(&node, &ctx);
        assert_eq!(r.id(), "summary/mentions-outcome");
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].path, "doc.md");
        assert_eq!(out[0].pos, Some(SourcePos::at(1, 1)));
    }

    #[test]
    fn default_level_opts_match_the_ts_defaults() {
        let opts = LevelOpts::default();
        assert_eq!(opts.order, Order::None);
        assert!(opts.allow_unknown);
    }
}
