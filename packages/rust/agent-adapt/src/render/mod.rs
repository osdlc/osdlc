//! Shared rendering helpers for runtime implementations.
//!
//! This module is the single source of truth for YAML-frontmatter / SKILL.md /
//! manifest serialization, so a runtime impl collapses to its path and
//! dialect choices.
//!
//! # Layers
//!
//! * [`frontmatter::FrontmatterBuilder`] — low-level YAML emitter that
//!   honors the runtime's [`crate::FrontmatterDialect`].
//! * [`skill_md::render_skill_md`] — composes a [`crate::Skill`] into a
//!   complete `SKILL.md` body (frontmatter + markdown).
//! * [`agent_md::render_agent_md`] — composes an [`crate::Agent`] into
//!   a markdown file (frontmatter + system prompt body).
//! * [`hooks_json::render_hooks_json`] — emits the nested `hooks.json`
//!   file, with per-runtime event and matcher translation, and a refusal
//!   for an event the target does not carry.
//!   [`hooks_json::render_cursor_hooks_json`] writes Cursor's own shape.
//! * [`script_body::render_script_body`] — picks the shebang based on
//!   language and prepends it to the script body.
//! * [`manifest::render_plugin_manifest`] — human-readable plugin overview.
//! * [`role_md::render_role_md`] — one [`crate::Role`] as `roles/<slug>.md`,
//!   the runtime-agnostic form every composition writes.
//! * [`arguments::derive_argument_hint`], [`arguments::derive_argument_names`]
//!   and [`arguments::render_arguments_section`] — turn a [`crate::Argument`]
//!   list into the hint string, Claude Code's `arguments:` name list, and the
//!   body section both [`skill_md::render_skill_md`] and
//!   [`command_md::render_command_md`] use. [`arguments::ArgumentSite`]
//!   distinguishes a skill body from a command body, since a runtime's
//!   argument mechanism can apply to one and not the other.
//! * [`command_md::render_command_md`] — the one Markdown-with-frontmatter
//!   command renderer every such runtime shares; [`command_md::CommandFields`]
//!   is the small per-runtime description of which optional frontmatter keys
//!   that runtime's command format accepts, and what to call the tool-list
//!   key when it does.

pub mod agent_md;
pub mod arguments;
pub mod command_md;
pub mod frontmatter;
pub mod hooks_json;
pub mod manifest;
pub mod role_md;
pub mod script_body;
pub mod skill_md;

pub use agent_md::render_agent_md;
pub use arguments::{
    ArgumentSite, derive_argument_hint, derive_argument_names, render_arguments_section,
};
pub use command_md::{CommandFields, render_command_md, render_command_md_reporting};
pub use frontmatter::FrontmatterBuilder;
pub use hooks_json::{
    hook_refusal, render_cursor_hooks_json, render_hooks_json, render_hooks_json_reporting,
};
pub use manifest::render_plugin_manifest;
pub use role_md::{render_role_md, role_path};
pub use script_body::{render_script_body, script_filename};
pub use skill_md::{render_skill_md, render_skill_md_reporting};
