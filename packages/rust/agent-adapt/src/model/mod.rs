//! Pure content models — the shapes runtime capability traits consume.
//!
//! Every struct here is a **subset** of what an application might persist:
//! we carry only the fields a runtime needs to render an export. Database
//! metadata (`id`, `created_at`, `version`) is the caller's responsibility —
//! they keep a row type containing a `content: agent_adapt::Skill` and hand
//! the content subset to the crate at the API boundary.
//!
//! All models derive `Serialize`/`Deserialize` so plugin manifests and
//! authored content can round-trip through JSON, YAML, or TOML without
//! custom glue.

mod agent;
mod argument;
mod command;
mod hook;
mod plugin;
mod role;
mod script;
mod skill;

pub use agent::Agent;
pub use argument::Argument;
pub use command::Command;
pub use hook::{Hook, HookType};
pub use plugin::{Marketplace, Plugin, PluginBundle};
pub use role::Role;
pub use script::{Script, ScriptLanguage};
pub use skill::{Skill, SkillResource};
