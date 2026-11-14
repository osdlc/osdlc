//! The model catalogue: types, the strict layer schemas, layering, derived
//! offerings and the query API.

pub mod layers;
pub mod offerings;
pub mod query;
pub mod schema;
pub mod types;

pub use layers::layer_catalogue;
pub use offerings::{derive_offerings, native_name};
pub use query::{CatalogueQuery, FoundModel, MappingPolicy, query_catalogue};
pub use schema::{MachineCatalogue, SchemaError, SnapshotLayer};
pub use types::*;
