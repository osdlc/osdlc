//! The Rust engine for markdown-contract, the twin of the TypeScript package
//! `@osdlc/markdown-contract`. The shared corpus in `packages/ts/markdown-contract/corpus/`
//! pins the two to the same findings for every YAML-expressible fixture: the same count
//! and ids in order, and the level, line and hint where a fixture records them
//! (`tests/corpus.rs`).
//!
//! [`validate()`] runs every check in one pass: the projection, the structure plane, the
//! content plane (frontmatter schema; table, list, code and `maxWords` leaves), the
//! text constraints and the document rules. Contracts come from the builders
//! ([`Contract`], [`section`], [`rule`] and the rest) or the YAML loader
//! ([`load_contract`]); [`run_corpus`] routes documents to contracts by glob.
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
//! The core takes strings and does no I/O, so it builds for `wasm32-unknown-unknown`.
//! Reading files lives behind the `native` feature (on by default; build with
//! `default-features = false` for wasm32).
//!
//! A text rule's `regex` and a frontmatter string's `pattern` use the `regex` crate's
//! dialect, not JavaScript's: no lookaround or backreferences, and `\w`, `\d` and `\b`
//! are Unicode-aware. The loader rejects a source the crate cannot compile. The README
//! lists the other differences from the TS package.
//!
//! This file is a barrel only: it re-exports, it holds no logic.

mod camel;
mod content;
mod contract;
mod declarative;
mod dialect;
mod finding;
mod frontmatter;
mod js;
mod parse;
mod registry;
mod runner;
mod schema;
mod structure;
mod text_constraints;
mod text_match;
mod tree;
mod validate;

pub use contract::{
    CodeConfig, Contract, DocRule, EveryItem, ExtraColumns, FrontmatterSpec, GapSpec, LeafConfig,
    LeafSpec, LevelOpts, ListConfig, OneOfSpec, Order, Rule, SectionContent, SectionOpts,
    SectionSeq, SectionSpec, Spec, TableConfig, doc_rule, gap, gap_bounds, one_of, one_of_with,
    optional, rule, section, section_with, sections,
};
pub use declarative::{
    ContractResolver, DeclarativeError, compile_contract_object, load_config, load_contract,
};
#[cfg(feature = "native")]
pub use declarative::{load_config_file, load_contract_file};
pub use dialect::{VaultRef, VaultRefKind, extract_vault_refs};
pub use finding::{EditRange, Finding, FindingLevel, Fix, SourcePos, TextEdit};
pub use parse::{FrontmatterSplit, parse_document, split_frontmatter};
pub use registry::{Ctx, FindingSpec, Registry};
pub use runner::{
    CorpusConfig, CorpusRule, GlobError, RunOptions, RunOutcome, RunStats, run_corpus,
};
#[cfg(feature = "native")]
pub use runner::{NativeRunError, run_corpus_dir, walk_dir};
pub use schema::{ConstValue, Schema, StringFormat};
pub use text_constraints::{TextRuleSpec, forbids, requires, text_rule};
pub use text_match::TextMatchSpec;
pub use tree::{BlockKind, BlockNode, DocTree, Frontmatter, ListItem, SectionNode};
pub use validate::{validate, validate_tree};
