use serde::{Deserialize, Serialize};

/// An agent *persona* — a preset combining a model, system prompt,
/// temperature, and a tool allowlist.
///
/// Not to be confused with a coding-agent *runtime* (Claude Code, Codex
/// CLI), which is [`crate::CodingAgentRuntime`]. Runtimes that support
/// personas implement [`crate::AgentCapability`]; those that don't simply
/// skip agents when rendering a bundle.
///
/// # Field notes
///
/// * [`Agent::slug`] is the stable identifier used as the filename
///   (`agents/<slug>.md`). Author's responsibility to keep it valid.
/// * [`Agent::tools`] holds canonical tool names, translated per-runtime
///   at render time.
/// * [`Agent::is_template`] marks an agent meant to be *cloned*, not
///   invoked directly.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Agent {
    /// Human-readable name, e.g. `"Code Reviewer"`.
    pub name: String,
    /// Stable kebab-case identifier used as the filename base.
    pub slug: String,
    /// Optional description.
    pub description: Option<String>,
    /// Optional model identifier, e.g. `"sonnet"`, `"opus"`.
    pub model: Option<String>,
    /// System prompt rendered as the body of the agent file.
    pub system_prompt: Option<String>,
    /// Optional sampling temperature.
    pub temperature: Option<f64>,
    /// Canonical tool names this agent is allowed to use.
    pub tools: Vec<String>,
    /// Free-form tags.
    #[serde(default)]
    pub tags: Vec<String>,
    /// Optional category.
    pub category: Option<String>,
    /// If `true`, this agent is a template.
    pub is_template: bool,
}

impl Agent {
    /// Convenience constructor.
    pub fn new(name: impl Into<String>, slug: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            slug: slug.into(),
            description: None,
            model: None,
            system_prompt: None,
            temperature: None,
            tools: Vec::new(),
            tags: Vec::new(),
            category: None,
            is_template: false,
        }
    }
}
