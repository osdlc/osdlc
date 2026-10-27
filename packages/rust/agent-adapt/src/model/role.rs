use serde::{Deserialize, Serialize};

/// A role — a reusable chunk of system-prompt content that can be injected
/// into an [`crate::Agent`] or referenced from a [`crate::Skill`].
///
/// Roles exist so the same "you are an expert X" preamble isn't duplicated
/// across every agent and skill that needs it. Runtimes that support role
/// injection reference them by slug at render time.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Role {
    /// Human-readable name.
    pub name: String,
    /// Stable kebab-case identifier used for linking.
    pub slug: String,
    /// Optional description.
    pub description: Option<String>,
    /// System-prompt body for the role.
    pub body: String,
    /// Free-form tags.
    #[serde(default)]
    pub tags: Vec<String>,
}
