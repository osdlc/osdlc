//! The matched Rust engine for markdown-contract, with finding parity to
//! the TypeScript engine in `@osdlc/markdown-contract` (identical ids, level defaults, 1-based
//! positions, deterministic sort, and JSON shape) — pinned by the shared corpus
//! harness (`tests/corpus.rs`).
//!
//! All planes run in one pass ([`validate()`]): the projection, the structure plane, the
//! content plane (frontmatter schema + table/list/code/maxWords leaves), the
//! declarative text constraints, and doc-scoped rules. Contracts come from the
//! programmatic builders ([`contract`]) or the declarative YAML loader
//! ([`declarative`]); the corpus [`runner`] routes documents to contracts by glob.
//!
//! ```
//! use markdown_contract::{load_contract, validate};
//!
//! let contract = load_contract("\
//! mcVersion: 2
//! kind: contract
//! body:
//!   sections:
//!     - section: Context
//! ")?;
//! let findings = validate("## Notes\n", &contract, "note.md");
//! assert_eq!(findings[0].id, "structure/section-missing");
//! # Ok::<(), markdown_contract::DeclarativeError>(())
//! ```
//!
//! The core is fs-free and `wasm32-unknown-unknown`-compatible: strings in, findings
//! out. fs walking and config/contract file loading live behind the `native` feature
//! (default on, excluded from wasm builds).
//!
//! This file is a barrel only: it re-exports, it holds no logic.

pub mod camel;
pub mod content;
pub mod contract;
pub mod declarative;
pub mod dialect;
pub mod finding;
pub mod frontmatter;
pub mod parse;
pub mod registry;
pub mod runner;
pub mod schema;
pub mod structure;
pub mod text_constraints;
pub mod text_match;
pub mod tree;
pub mod validate;

pub use camel::to_camel_key;
pub use content::match_content;
pub use contract::{
    CodeConfig, Contract, DocRule, EveryItem, ExtraColumns, FrontmatterSpec, GapSpec, LeafConfig,
    LeafSpec, LevelOpts, ListConfig, OneOfSpec, Order, Rule, SectionContent, SectionOpts,
    SectionSeq, SectionSpec, Spec, TableConfig, doc_rule, gap, gap_bounds, one_of, one_of_with,
    optional, rule, section, section_with, sections,
};
pub use declarative::{
    DeclarativeError, DeclarativeKind, compile_contract_object, load_config, load_contract,
    parse_declarative_doc,
};
#[cfg(feature = "native")]
pub use declarative::{load_config_file, load_contract_file};
pub use finding::{EditRange, Finding, FindingLevel, Fix, SourcePos, TextEdit};
pub use frontmatter::match_frontmatter;
pub use parse::{FrontmatterSplit, parse_document, split_frontmatter};
pub use registry::{Ctx, FindingSpec, Registry};
pub use runner::{CorpusConfig, CorpusRule, RunOptions, RunOutcome, RunStats, run_corpus};
#[cfg(feature = "native")]
pub use runner::{run_corpus_dir, walk_dir};
pub use schema::{Schema, StringFormat};
pub use structure::{match_structure, scan_heading_depth_jumps};
pub use text_constraints::{TextRuleSpec, forbids, requires, text_rule};
pub use text_match::{TextMatchSpec, match_text, synthesize_text_id};
pub use tree::{BlockKind, BlockNode, DocTree, Frontmatter, ListItem, SectionNode};
pub use validate::{sort_findings, validate, validate_tree};
