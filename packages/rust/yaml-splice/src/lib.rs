//! Edit top-level fields of a YAML mapping without reserializing it.
//!
//! [`edit_yaml`] takes UTF-8 YAML bytes and an ordered list of field edits
//! ([`FieldEdit::Set`], [`FieldEdit::Remove`], [`FieldEdit::Rename`]) and
//! returns new bytes or a typed [`EditError`]. Only the bytes of the edited
//! field change. Every other byte (comments, key order, quoting, blank lines,
//! a BOM, CRLF line endings) is kept, because it is never re-emitted. An edit
//! that changes nothing returns the input bytes unchanged.
//!
//! The crate does no I/O. It has no clock, locale or global state, so the same
//! input always gives the same output.
//!
//! ```
//! use yaml_splice::{FieldEdit, Value, edit_yaml};
//!
//! let src = b"# notes\ntitle: 'Draft'   # keep this comment\ntags: [a, b]\n";
//! let out = edit_yaml(
//!     src,
//!     &[FieldEdit::Set { key: "title".into(), value: Value::from("Final") }],
//! )?;
//! assert!(out.changed);
//! assert_eq!(out.bytes, b"# notes\ntitle: Final   # keep this comment\ntags: [a, b]\n");
//! # Ok::<(), yaml_splice::EditError>(())
//! ```
//!
//! # The public items
//!
//! - [`edit_yaml`] and [`edit_yaml_with`] edit a whole YAML document.
//! - [`edit_frontmatter`] and [`edit_frontmatter_with`] edit a Markdown
//!   frontmatter block that was cut out without its last line ending.
//! - [`Value`] and [`Mapping`] are the value model a `Set` writes. A
//!   [`Mapping`] keeps keys in insertion order.
//! - The [`parse`], [`render`] and [`splice`] modules are the lower layers the
//!   edit functions are built on: a parser that keeps byte spans, a value
//!   emitter, and the older single-key splice functions.
//!
//! **Stability.** The edit functions, [`FieldEdit`], [`EditOptions`],
//! [`EditOutcome`], [`EditError`], [`Value`] and [`Mapping`] are marked
//! "stable in 0.x" in their docs: they are not expected to change in a
//! breaking way. The [`parse`], [`render`] and [`splice`] modules and
//! [`value::js_float_to_string`] are marked "unstable": they may change in any
//! 0.x minor release.
//!
//! # Cargo features
//!
//! - `serde_json` (on by default): `impl From<&serde_json::Value> for Value`.
//!   It is the only use of `serde_json`. Parsing, rendering and the edit
//!   functions do not need it. Turn it off with `default-features = false`.
//!
//! # The modules
//!
//! | module | what it holds |
//! |---|---|
//! | [`edit`] | the edit functions, built on the modules below |
//! | [`value`] | the ordered [`Value`]/[`Mapping`] model and JavaScript number formatting |
//! | [`parse`] | the `saphyr-parser` based parser that keeps byte spans |
//! | [`render`] | the YAML value emitter, matching the npm `yaml` package (v2) byte for byte |
//! | [`splice`] | the older single-key splice functions |
//!
//! The crate does not reformat a whole document. [`render`] only renders the
//! new bytes an edit writes.

#![forbid(unsafe_code)]
#![warn(missing_docs, clippy::missing_errors_doc, clippy::missing_panics_doc)]

pub mod edit;
pub mod parse;
pub mod render;
pub mod splice;
pub mod value;

pub use edit::{
    EditError, EditOptions, EditOutcome, FieldEdit, edit_frontmatter, edit_frontmatter_with,
    edit_yaml, edit_yaml_with,
};
pub use value::{Mapping, Value};

/// Runs the README's code blocks as doc-tests.
#[cfg(doctest)]
#[doc = include_str!("../README.md")]
struct ReadmeDoctests;
