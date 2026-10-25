//! The declarative front-end: YAML in, runtime
//! [`Contract`](crate::contract::Contract)s / [`CorpusConfig`](crate::runner::CorpusConfig)s
//! out — the data-authoring twin of the programmatic builders, with authoring mistakes
//! rejected at compile time as typed [`DeclarativeError`]s. The envelope speaks
//! `mcVersion: 2`, the JSON-Schema-idiom vocabulary (`schema_v2` / `body_v2`); v1 is
//! retired, and the envelope gate names the migrate command.
//!
//! This file is a barrel only: it re-exports, it holds no logic.

pub mod body_v2;
pub mod config;
pub mod errors;
pub mod load;
pub mod parse;
pub mod schema_v2;
pub mod text;

pub use body_v2::compile_body_v2;
#[cfg(feature = "native")]
pub use config::load_config_file;
pub use config::{ContractResolver, load_config};
pub use errors::DeclarativeError;
#[cfg(feature = "native")]
pub use load::load_contract_file;
pub use load::{compile_contract_object, load_contract};
pub use parse::{DeclarativeDoc, DeclarativeKind, parse_declarative_doc};
pub use schema_v2::{compile_frontmatter_v2, compile_schema_v2};
pub use text::{compile_body_text_rule, compile_section_text_rules, has_text_keys};
