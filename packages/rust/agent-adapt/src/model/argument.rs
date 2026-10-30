//! A single declared argument on a [`crate::Skill`] or [`crate::Command`].
//!
//! The shape follows the Model Context Protocol's prompt `arguments` array
//! (`name`, `description`, `required`) and adds the two fields no harness
//! surveyed carries: `values`, an optional enum of allowed strings, and
//! `default`, an optional value drawn from `values` when it is present.
//!
//! This struct carries no validation of its own — a caller assembling one
//! by hand (a test, a future adopter) is not refused for an empty `name` or
//! a `default` outside `values`. The authoring-time rules live where the
//! note is read: `tradecraft-core`'s `frontmatter` module (in osdlc/skillwright) parses `sw-arguments`
//! into a `Vec<Argument>` and refuses a note that breaks one.

use serde::{Deserialize, Serialize};

/// One argument a [`crate::Skill`] or [`crate::Command`] declares.
///
/// Rendered two ways: [`crate::render::derive_argument_hint`] folds the list
/// into a single hint string for a dialect that has one field for it
/// (Claude Code's `argument-hint`), and
/// [`crate::render::render_arguments_section`] writes the whole list into the
/// body as prose, in the syntax the target runtime's invocation mechanism
/// uses — or as a plain description when it has none.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Argument {
    /// A slug: unique among the arguments on the same skill or command.
    pub name: String,
    /// What the argument is for, shown beside its name wherever the list is
    /// rendered.
    pub description: Option<String>,
    /// Whether the caller must supply this argument. Defaults to `false`.
    #[serde(default)]
    pub required: bool,
    /// The closed set of values this argument accepts, when it is an enum.
    /// `None` means any value; `Some` is never empty — an argument with no
    /// allowed values is not an enum, and authoring that is refused before
    /// this struct exists.
    pub values: Option<Vec<String>>,
    /// The value assumed when the caller supplies none. When `values` is
    /// `Some`, this is one of them — also enforced before this struct exists,
    /// not here.
    pub default: Option<String>,
}

impl Argument {
    /// Convenience constructor for a required argument with no enum and no
    /// default.
    pub fn required(name: impl Into<String>, description: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            description: Some(description.into()),
            required: true,
            values: None,
            default: None,
        }
    }

    /// Convenience constructor for an optional argument with no enum and no
    /// default.
    pub fn optional(name: impl Into<String>, description: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            description: Some(description.into()),
            required: false,
            values: None,
            default: None,
        }
    }
}
