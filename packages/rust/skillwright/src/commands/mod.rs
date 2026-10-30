//! One module per verb, each a thin resolution of flags against
//! configuration followed by one call into `tradecraft_core`.
//!
//! `marketplace` backs two verbs: `build` and `check` are one path in two
//! modes, exactly as they are in the core. `watch` is `build --watch`: it
//! owns no rendering of its own and calls back into `marketplace::run_export`
//! on every debounced vault change.

pub mod adopt;
pub mod authoring;
pub mod bump;
pub mod harness;
pub mod list;
pub mod marketplace;
pub mod publish;
pub mod status;
pub mod watch;
