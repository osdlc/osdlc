//! The declarative front-end: YAML in, [`Contract`](crate::Contract)s and
//! [`CorpusConfig`](crate::CorpusConfig)s out. It is the data-authoring twin of the
//! programmatic builders, and rejects authoring mistakes as [`DeclarativeError`]s. The
//! envelope is `mcVersion: 2` with a JSON Schema subset (`schema_v2`, `body_v2`). A v1
//! file is rejected with a pointer to the migrate command.
//!
//! This file is a barrel only: it re-exports, it holds no logic.

mod body_v2;
mod config;
mod errors;
mod load;
mod parse;
mod schema_v2;
mod text;
mod yaml;

#[cfg(feature = "native")]
pub use config::load_config_file;
pub use config::{ContractResolver, load_config};
pub use errors::DeclarativeError;
#[cfg(feature = "native")]
pub use load::load_contract_file;
pub use load::{compile_contract_object, load_contract};
