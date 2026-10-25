//! The `marketplace:` block of `tradecraft.yaml`, and its mapping onto a
//! build's [`MarketplaceConfig`].
//!
//! The CLI and other hosts read this block. It lives here so they share one
//! shape and one mapping.
//!
//! The file itself — finding it, the machine layer, `{name}` path tokens —
//! stays with the caller. This module parses text and never touches a
//! filesystem.

use std::collections::{BTreeMap, BTreeSet};

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

use crate::export::{DEFAULT_SHIM_TARGET, MarketplaceConfig, PluginOverrides};

/// The project file's name.
pub const PROJECT_FILE: &str = "tradecraft.yaml";

/// What `build` and `check` render. Everything except `out` and
/// `skills_root` becomes the core's [`MarketplaceConfig`] through
/// [`MarketplaceSettings::to_config`].
#[derive(Debug, Clone, PartialEq, Deserialize, Serialize, Default)]
#[serde(deny_unknown_fields)]
pub struct MarketplaceSettings {
    /// The marketplace's name when the vault holds no marketplace note; a
    /// fallback.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Codex's `interface.displayName`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    /// Claude's marketplace `owner`; free-shaped.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner: Option<serde_yaml::Value>,
    /// Default plugin author; falls back to `owner`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<serde_yaml::Value>,
    /// Default plugin license, as an SPDX identifier; every plugin under the
    /// marketplace inherits it. A marketplace note's `tc-license` wins over
    /// this, as it does for the other identity fields.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub license: Option<String>,
    /// The plugin a note with no `tc-plugin` belongs to.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_plugin: Option<String>,
    /// Per-plugin manifest overrides, keyed by plugin name.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plugins: Option<BTreeMap<String, serde_yaml::Value>>,
    /// The marketplace directory: one directory holding one marketplace,
    /// which every harness reads from.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub out: Option<String>,
    /// The content root to scan and adopt under. Absent means the vault
    /// root.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub skills_root: Option<String>,
    /// Which harnesses the marketplace is built for. Absent means every
    /// harness this build supports.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub harnesses: Option<Vec<String>>,
    /// Refuse `build` and `check` when a note has a `name` and no
    /// `description`. Absent or `false` publishes a filler and warns.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub require_descriptions: Option<bool>,
    /// Where the per-skill `scripts/sdlc` shim looks for this marketplace's
    /// launcher asset, relative to the plugin's own root — see
    /// [`MarketplaceConfig::shim_target`]. Absent means
    /// [`DEFAULT_SHIM_TARGET`] (`"cli/sdlc"`), which is what every project
    /// file predating this field keeps resolving to.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shim_target: Option<String>,
}

/// A setting that has no place in a manifest, named by its key.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("`{key}` is not {what}: {detail}")]
pub struct SettingsError {
    /// The setting's key.
    pub key: String,
    /// What the key must be.
    pub what: &'static str,
    /// Why the value does not fit.
    pub detail: String,
}

/// A YAML value read as its JSON equivalent. The settings are YAML because they
/// come from a YAML file; a manifest is JSON. A YAML mapping whose keys are
/// not strings has no JSON equivalent, and comes back as the error naming why.
fn from_yaml<T: DeserializeOwned>(value: &serde_yaml::Value) -> Result<T, serde_json::Error> {
    serde_json::to_value(value).and_then(serde_json::from_value)
}

impl MarketplaceSettings {
    /// Whether no setting is present.
    pub fn is_blank(&self) -> bool {
        self.name.is_none()
            && self.display_name.is_none()
            && self.owner.is_none()
            && self.author.is_none()
            && self.license.is_none()
            && self.default_plugin.is_none()
            && self.plugins.is_none()
            && self.out.is_none()
            && self.skills_root.is_none()
            && self.harnesses.is_none()
            && self.require_descriptions.is_none()
            && self.shim_target.is_none()
    }

    /// The build config these settings describe. `default_plugin` is the
    /// caller's resolved answer — a flag, this block's own, or a fallback —
    /// because only the caller knows its precedence.
    pub fn to_config(&self, default_plugin: String) -> Result<MarketplaceConfig, SettingsError> {
        let json = |value: &Option<serde_yaml::Value>, key: &str| {
            value
                .as_ref()
                .map(from_yaml::<serde_json::Value>)
                .transpose()
                .map_err(|err| SettingsError {
                    key: key.to_owned(),
                    what: "a value a manifest can carry",
                    detail: err.to_string(),
                })
        };
        let mut plugins = BTreeMap::new();
        // Passed through unread: the manifest fields a plugin overrides, and
        // every default an absence means, are the export's.
        for (name, value) in self.plugins.iter().flatten() {
            let parsed = from_yaml::<PluginOverrides>(value).map_err(|err| SettingsError {
                key: format!("marketplace.plugins.{name}"),
                what: "a plugin override",
                detail: err.to_string(),
            })?;
            plugins.insert(name.clone(), parsed);
        }
        Ok(MarketplaceConfig {
            name: self.name.clone(),
            display_name: self.display_name.clone(),
            owner: json(&self.owner, "marketplace.owner")?,
            // Supplied by the marketplace note alone: a description has no
            // fallback the way a name does, and an absent one is legal
            // everywhere.
            description: None,
            author: json(&self.author, "marketplace.author")?,
            license: self.license.clone(),
            default_plugin,
            plugins,
            require_descriptions: self.require_descriptions.unwrap_or(false),
            shim_target: self
                .shim_target
                .clone()
                .unwrap_or_else(|| DEFAULT_SHIM_TARGET.to_owned()),
        })
    }

    /// The harnesses to build. Empty means every one the export supports.
    pub fn harness_set(&self) -> BTreeSet<String> {
        self.harnesses.iter().flatten().cloned().collect()
    }
}

/// The two keys of a project file a build reads without the CLI: which vault
/// the file is for, and its `marketplace:` block.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ProjectMarketplace {
    /// `vault:` as written — relative to the file, possibly with `{name}`
    /// tokens. The caller decides whether the file is for its vault.
    pub vault: Option<String>,
    /// The `marketplace:` block.
    pub marketplace: MarketplaceSettings,
}

/// Read `vault:` and `marketplace:` out of a project file's text. Other
/// top-level keys belong to the CLI and are ignored; the `marketplace:` block
/// is read strictly, so a typo there is an error rather than a silent default.
pub fn parse_project_marketplace(text: &str) -> Result<ProjectMarketplace, SettingsError> {
    let invalid = |key: &str, what, err: serde_yaml::Error| SettingsError {
        key: key.to_owned(),
        what,
        detail: err.to_string(),
    };
    let doc: serde_yaml::Value =
        serde_yaml::from_str(text).map_err(|err| invalid(PROJECT_FILE, "valid YAML", err))?;
    let vault = match doc.get("vault") {
        None | Some(serde_yaml::Value::Null) => None,
        Some(value) => Some(
            serde_yaml::from_value::<String>(value.clone())
                .map_err(|err| invalid("vault", "a path", err))?,
        ),
    };
    let marketplace = match doc.get("marketplace") {
        None | Some(serde_yaml::Value::Null) => MarketplaceSettings::default(),
        Some(value) => serde_yaml::from_value(value.clone())
            .map_err(|err| invalid("marketplace", "a marketplace block", err))?,
    };
    Ok(ProjectMarketplace { vault, marketplace })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_project_file_maps_onto_a_build_config() {
        let parsed = parse_project_marketplace(
            "vault: ./vault\n\
             namespace: tc\n\
             marketplace:\n  \
               default_plugin: tools\n  \
               owner: { name: Ada }\n  \
               require_descriptions: true\n  \
               harnesses: [claude]\n  \
               plugins:\n    tools: { version: 2.0.0 }\n",
        )
        .unwrap();
        assert_eq!(parsed.vault.as_deref(), Some("./vault"));
        let config = parsed
            .marketplace
            .to_config(parsed.marketplace.default_plugin.clone().unwrap())
            .unwrap();
        assert_eq!(config.default_plugin, "tools");
        assert!(config.require_descriptions);
        assert_eq!(config.owner, Some(serde_json::json!({"name": "Ada"})));
        assert_eq!(config.plugins["tools"].version.as_deref(), Some("2.0.0"));
        assert_eq!(
            parsed.marketplace.harness_set(),
            BTreeSet::from(["claude".to_owned()])
        );
        // No `shim_target:` in the block above — every project file written
        // before this field existed keeps resolving the shim to `cli/sdlc`.
        assert_eq!(config.shim_target, DEFAULT_SHIM_TARGET);
    }

    #[test]
    fn a_project_file_can_declare_a_non_default_shim_target() {
        let parsed = parse_project_marketplace(
            "vault: ./vault\n\
             marketplace:\n  \
               default_plugin: tools\n  \
               shim_target: bin/launcher\n",
        )
        .unwrap();
        let config = parsed
            .marketplace
            .to_config(parsed.marketplace.default_plugin.clone().unwrap())
            .unwrap();
        assert_eq!(config.shim_target, "bin/launcher");
    }

    #[test]
    fn a_file_without_a_marketplace_block_reads_as_blank() {
        let parsed = parse_project_marketplace("vault: .\n").unwrap();
        assert!(parsed.marketplace.is_blank());
    }

    #[test]
    fn a_typo_in_the_marketplace_block_is_named() {
        let err = parse_project_marketplace("marketplace:\n  default_plugn: x\n").unwrap_err();
        assert_eq!(err.key, "marketplace");
        assert!(err.detail.contains("default_plugn"), "{err}");
    }

    #[test]
    fn a_plugin_override_that_is_not_one_is_named() {
        let parsed =
            parse_project_marketplace("marketplace:\n  plugins:\n    tools: [1]\n").unwrap();
        let err = parsed.marketplace.to_config("core".into()).unwrap_err();
        assert_eq!(err.key, "marketplace.plugins.tools");
    }
}
