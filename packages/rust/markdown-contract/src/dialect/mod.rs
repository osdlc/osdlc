//! The Obsidian syntax the engine always recognizes. Barrel only.
//!
//! - [`anchors`]: line-terminal `^block-id` tokens.
//! - [`wikilinks`]: `[[wikilink]]` and `![[transclusion]]` recognition over flattened text.

pub(crate) mod anchors;
pub(crate) mod wikilinks;

pub(crate) use anchors::{extract_trailing_anchor, is_standalone_anchor};
pub use wikilinks::{VaultRef, VaultRefKind, extract_vault_refs};
