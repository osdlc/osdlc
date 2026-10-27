use serde::{Deserialize, Serialize};

/// The language a [`Script`] is written in.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScriptLanguage {
    /// `#!/usr/bin/env bash`, extension `.sh`.
    Bash,
    /// `#!/usr/bin/env python3`, extension `.py`.
    Python,
    /// `#!/usr/bin/env node`, extension `.js`.
    Node,
    /// Caller-specified language; extension is the contained string and no
    /// shebang is emitted.
    Other(String),
}

impl ScriptLanguage {
    /// File extension (without leading dot).
    pub fn extension(&self) -> &str {
        match self {
            Self::Bash => "sh",
            Self::Python => "py",
            Self::Node => "js",
            Self::Other(ext) => ext,
        }
    }

    /// Shebang line (without trailing newline), or `None` for `Other`.
    pub fn shebang(&self) -> Option<&'static str> {
        match self {
            Self::Bash => Some("#!/usr/bin/env bash"),
            Self::Python => Some("#!/usr/bin/env python3"),
            Self::Node => Some("#!/usr/bin/env node"),
            Self::Other(_) => None,
        }
    }
}

/// A standalone script shipped as part of a plugin.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Script {
    /// Human-readable name.
    pub name: String,
    /// Stable kebab-case identifier used as filename base.
    pub slug: String,
    /// Optional description.
    pub description: Option<String>,
    /// Script language — determines extension and shebang.
    pub language: ScriptLanguage,
    /// Script body (without shebang — prepended at render time).
    pub body: String,
    /// Execution timeout in milliseconds. `0` means no timeout.
    pub timeout_ms: i64,
    /// Free-form tags.
    #[serde(default)]
    pub tags: Vec<String>,
    /// Optional category.
    pub category: Option<String>,
    /// If `true`, this script is a template.
    pub is_template: bool,
}
