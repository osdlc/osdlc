//! Rust mirror of the pure, browser-safe core of `@osdlc/agent-router`
//! (`packages/ts/agent-router`), so a Rust host resolves the same references and
//! profiles as a TypeScript one.
//!
//! The TypeScript package is the reference. It emits JSON fixture vectors
//! (`packages/ts/agent-router/fixtures`), and this crate's tests read the same
//! files: a vector is `{ name, input, expected }` and the Rust result must
//! equal `expected`.
//!
//! Not mirrored: the author rule, the `config` subpath and the models.dev fetch; see the
//! README.
//!
//! The tier and trait sets are the single enums [`Tier`] and [`Trait`]. Adding one
//! touches several places in step; the README's "Adding a trait or tier" lists them.

pub mod binding;
pub mod catalogue;
pub mod chains;
pub mod choose;
pub mod classify;
pub mod context;
pub mod effort;
pub mod profile;
pub mod reference;
pub mod resolve;
pub mod routing;
pub mod validity;
pub mod wildcard;

pub use catalogue::{
    Catalogue, CatalogueLayer, CatalogueProblem, CatalogueQuery, LayerOptions, MappingPolicy,
    layer_catalogue, query_catalogue,
};
pub use reference::{Ref, RefParseError, RefParseErrorKind, Tier, Trait, format_ref, parse_ref};
