//! A slash command: prose a *person* invokes by name.

use serde::{Deserialize, Serialize};

use crate::Argument;

/// A user-invoked command.
///
/// The sibling of [`crate::Skill`], and the difference is who invokes it: a
/// skill is loaded by the model when it judges the description relevant, a
/// command is typed by a person as `/name`. They land in different
/// directories, and a runtime that has skills need not have commands.
///
/// `argument_hint` exists here and not on an [`crate::Agent`] because a
/// command takes arguments at the point of invocation, and the hint is what
/// the harness shows the person typing it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Command {
    /// Human-readable name.
    pub name: String,
    /// Stable kebab-case identifier used as the filename base.
    pub slug: String,
    /// Optional description — what the harness lists beside the name.
    pub description: Option<String>,
    /// What the invocation looks like after the name, e.g. `<issue-number>`.
    /// Hand-written, or derived from [`Command::arguments`] the same way as
    /// [`crate::Skill::argument_hint`] — see its documentation.
    pub argument_hint: Option<String>,
    /// Claude Code's own `arguments:` frontmatter key — named positional
    /// arguments that make `$name` substitution available in the body.
    /// Hand-written, or derived the same way [`Command::argument_hint`] is —
    /// see [`crate::Skill::argument_names`], its sibling field.
    pub argument_names: Option<Vec<String>>,
    /// What this command's invocation is expected to carry, beyond the
    /// single hint string. Rendered into the body by
    /// [`crate::render::render_arguments_section`], in declaration order —
    /// the order Claude Code's `$0`, `$1`, … count from (0-based, matching
    /// `$ARGUMENTS[N]`/`$N`).
    #[serde(default)]
    pub arguments: Vec<Argument>,
    /// Canonical tool names this command may use.
    pub tools: Vec<String>,
    /// Optional model identifier.
    pub model: Option<String>,
    /// The prompt, rendered as the body.
    pub body: String,
    /// This render's own `ap-overrides.<target>` map, merged last over
    /// everything else here. Same contract as [`crate::Skill::overrides`].
    #[serde(default)]
    pub overrides: serde_json::Map<String, serde_json::Value>,
}

impl Command {
    /// Convenience constructor.
    pub fn new(name: impl Into<String>, slug: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            slug: slug.into(),
            description: None,
            argument_hint: None,
            argument_names: None,
            arguments: Vec::new(),
            tools: Vec::new(),
            model: None,
            body: String::new(),
            overrides: serde_json::Map::new(),
        }
    }
}
