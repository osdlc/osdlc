//! Config files for a command-line tool: a committed project file and a
//! per-machine file, read as YAML.
//!
//! - [`machine`]: [`MachineConfigFile<T>`](machine::MachineConfigFile), the
//!   per-machine file at `<config home>/<tool>/config.yaml`, moved by an env
//!   var and loaded into your `T` without ever failing.
//! - [`paths`]: a `paths:` map of named directories and `{name}` token
//!   expansion over path settings, plus `~` and relative path resolution.
//! - [`value`]: lookup by dotted key, and whether a value counts as set.
//! - [`file`](mod@file): reading a file into a YAML mapping, finding the project file
//!   by walking up, and overlaying the machine file onto the project file.
//! - [`needs`]: the check a command runs for the settings it cannot run
//!   without, and the one message an unmet need renders.
//!
//! **Stability.** Every public item is stable in 0.x: it is not expected to
//! change, and a breaking change would ship as 0.2. There are no unstable
//! items.

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
/// **Stability:** follows `tiered-dirs` 0.2; a move to `tiered-dirs` 0.3
/// would be a 0.6 release of this crate.
pub use tiered_dirs;

/// Runs the README's code blocks as doc-tests.
#[cfg(doctest)]
#[doc = include_str!("../README.md")]
struct ReadmeDoctests;
