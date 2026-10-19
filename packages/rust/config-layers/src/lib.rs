//! Layered config files: a project file that is committed and a machine file
//! that is not, read as YAML and merged key by key.
//!
//! A program keeps most settings in a file committed with the project. A few
//! settings are only true on one computer, such as `~/Developer`. Those go in
//! a second file in the user's config directory, which this crate finds and
//! reads, and the two are layered with the project file taking precedence.
//!
//! - [`machine`]: [`MachineConfigFile<T>`](machine::MachineConfigFile), the
//!   per-machine file at `<config home>/<tool>/config.yaml`, moved by an env
//!   var and loaded into your `T` without ever failing.
//! - [`file`](mod@file): reading a file into a YAML mapping, finding the
//!   project file by walking up, and filling the project file's gaps from the
//!   machine file.
//! - [`paths`]: a `paths:` map of named directories, `{name}` substitution
//!   in path settings, and `~` and relative path resolution.
//! - [`value`]: lookup by dotted key, and whether a value counts as set.
//! - [`needs`]: the check a command runs for the settings it cannot run
//!   without, and the one message an unmet need renders.
//!
//! **Stability.** Every public item is marked "stable in 0.x" in its docs. A
//! breaking change to one of them ships only in a new 0.x minor release,
//! with a CHANGELOG entry.

#![forbid(unsafe_code)]
#![warn(missing_docs, clippy::missing_errors_doc, clippy::missing_panics_doc)]

pub mod file;
pub mod machine;
pub mod needs;
pub mod paths;
pub mod value;

/// The directory resolver [`machine::MachineConfigFile`] takes, re-exported so
/// a caller names the same version this crate was built against.
///
/// **Stability:** follows `tiered-dirs` 0.3; a move to a new `tiered-dirs`
/// minor release is a new minor release of this crate, with a CHANGELOG entry.
pub use tiered_dirs;

/// The generic value tree ([`serde_json::Value`] and [`serde_json::Map`])
/// that [`file::read_mapping`], [`value`] and [`needs`] use, re-exported so a
/// caller names the same version this crate was built against.
///
/// **Stability:** follows `serde_json` 1.x; a move to a new major version of
/// `serde_json` would be a breaking release of this crate.
pub use serde_json;

/// Runs the README's code blocks as doc-tests.
#[cfg(doctest)]
#[doc = include_str!("../README.md")]
struct ReadmeDoctests;
