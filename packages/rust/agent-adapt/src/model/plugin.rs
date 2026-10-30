use serde::{Deserialize, Serialize};

use super::{Agent, Hook, Role, Script, Skill};

/// Plugin metadata — identity and provenance without the assets. The assets
/// live in [`PluginBundle`].
///
/// This split exists so authoring UIs can list plugins cheaply (just
/// metadata) and load the full bundle only when exporting.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Plugin {
    /// Human-readable name.
    pub name: String,
    /// Stable kebab-case identifier.
    pub slug: String,
    /// Optional namespace prefix (e.g. `"acme-corp"`).
    pub namespace: Option<String>,
    /// Optional description.
    pub description: Option<String>,
    /// Human-facing version label (e.g. `"1.2.0"`).
    pub version_label: String,
    /// Optional author string.
    pub author: Option<String>,
    /// Optional SPDX license identifier.
    pub license: Option<String>,
    /// Free-form tags.
    #[serde(default)]
    pub tags: Vec<String>,
    /// Optional category.
    pub category: Option<String>,
}

/// A complete authoring bundle: plugin metadata plus every asset it owns.
///
/// This is what gets handed to a runtime's render function, which produces
/// a [`crate::ExportedTree`] of virtual files.
/// [`crate::compose::render_plugin`] fixes the order the fields are walked
/// in.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PluginBundle {
    /// The plugin's identity/metadata.
    pub plugin: Plugin,
    /// All skills owned by this plugin.
    #[serde(default)]
    pub skills: Vec<Skill>,
    /// All roles the plugin owns.
    #[serde(default)]
    pub roles: Vec<Role>,
    /// All agent personas.
    #[serde(default)]
    pub agents: Vec<Agent>,
    /// All hooks.
    #[serde(default)]
    pub hooks: Vec<Hook>,
    /// All standalone scripts.
    #[serde(default)]
    pub scripts: Vec<Script>,
}

impl PluginBundle {
    /// Create an empty bundle wrapping the given plugin metadata.
    pub fn new(plugin: Plugin) -> Self {
        Self {
            plugin,
            skills: Vec::new(),
            roles: Vec::new(),
            agents: Vec::new(),
            hooks: Vec::new(),
            scripts: Vec::new(),
        }
    }
}

/// A marketplace: the container one level up from [`Plugin`], distributing a
/// named collection of plugins under one identity.
///
/// **Experimental.** This is additive scaffolding: the crate renders no
/// marketplace manifest from it yet. `tradecraft-core` (in osdlc/skillwright) still shapes
/// marketplace manifests (Claude's `owner`, Codex's `displayName`,
/// per-plugin overrides) from its own types. Moving that onto adapters, with
/// this type as the input, may change it in a minor release.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Marketplace {
    /// Human-readable name.
    pub name: String,
    /// Stable kebab-case identifier.
    pub slug: String,
    /// Optional display name (e.g. Codex's `interface.displayName`).
    pub display_name: Option<String>,
    /// Optional owner (e.g. Claude's marketplace `owner`).
    pub owner: Option<String>,
    /// Optional author, falling back to `owner` where a runtime requires one.
    pub author: Option<String>,
    /// Optional description.
    pub description: Option<String>,
    /// The plugins this marketplace distributes.
    #[serde(default)]
    pub plugins: Vec<Plugin>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn marketplace_round_trips_through_json() {
        let marketplace = Marketplace {
            name: "Example".into(),
            slug: "example-owner".into(),
            display_name: Some("Example Marketplace".into()),
            owner: Some("example-owner".into()),
            author: Some("example-owner".into()),
            description: Some("Personal plugin marketplace".into()),
            plugins: vec![Plugin {
                name: "Comment Review".into(),
                slug: "comment-review".into(),
                namespace: None,
                description: None,
                version_label: "1.0.0".into(),
                author: None,
                license: None,
                tags: vec![],
                category: None,
            }],
        };

        let json = serde_json::to_string(&marketplace).unwrap();
        let round_tripped: Marketplace = serde_json::from_str(&json).unwrap();
        assert_eq!(marketplace, round_tripped);
    }
}
