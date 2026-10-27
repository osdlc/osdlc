//! Free-function composition of capability traits into a full plugin
//! export.
//!
//! Plugin rendering is a free function with trait bounds, not a method on
//! [`crate::CodingAgentRuntime`], so a runtime implements only the
//! capabilities it actually supports — `npm_package` needs no `impl
//! HookCapability` for plugin rendering to type-check.
//!
//! [`render_plugin`] is the maximal composition, requiring every capability;
//! it is used by Claude Code, Codex CLI, OpenCode and Amp.
//! [`render_plugin_no_mcp_no_hooks`] requires only skills, agents and
//! scripts, and is used by `npm_package`.
//!
//! Each composition walks the bundle in a fixed order (skills → roles
//! → agents → hooks → scripts → manifest) and appends the resulting
//! files to an [`crate::ExportedTree`]. A bundle carries no MCP servers;
//! a caller renders those separately and extends the tree.

use crate::mcp::McpCapability;
use crate::render::{render_plugin_manifest, render_role_md, role_path};
use crate::{
    AgentCapability, ExportedFile, ExportedFileType, ExportedTree, HookCapability, PluginBundle,
    Result, ScriptCapability, SkillCapability,
};

/// Every role in the bundle, as `roles/<slug>.md`.
///
/// No capability trait and no runtime call: a role is authoring content no
/// runtime has a native container for, and writing it in this crate's own
/// shape is what keeps a bundle's roles from vanishing out of every export.
fn push_roles(tree: &mut ExportedTree, bundle: &PluginBundle) {
    for role in &bundle.roles {
        tree.push(ExportedFile {
            path: role_path(role),
            content: render_role_md(role).into_bytes(),
            kind: ExportedFileType::Role,
            executable: false,
        });
    }
}

/// Render an entire [`PluginBundle`] into an [`ExportedTree`] for a
/// runtime that implements every capability.
///
/// Ordering: skills, roles, agents, hooks, scripts, manifest last (so it
/// can reference everything above it).
///
/// # Errors
///
/// Propagates any error from an individual capability's render function.
/// Stops at the first failure — partial output is not returned.
pub fn render_plugin<R>(runtime: &R, bundle: &PluginBundle) -> Result<ExportedTree>
where
    R: SkillCapability + AgentCapability + HookCapability + ScriptCapability + McpCapability,
{
    let mut tree = ExportedTree::new();

    for skill in &bundle.skills {
        tree.extend(runtime.render_skill(skill)?);
    }
    push_roles(&mut tree, bundle);
    for agent in &bundle.agents {
        tree.extend(runtime.render_agent(agent)?);
    }
    if !bundle.hooks.is_empty() {
        tree.extend(runtime.render_hooks(&bundle.hooks)?);
    }
    for script in &bundle.scripts {
        tree.push(runtime.render_script(script)?);
    }

    // Manifest last so it sees the full list of rendered assets.
    tree.push(ExportedFile {
        path: "MANIFEST.md".into(),
        content: render_plugin_manifest(bundle)?.into_bytes(),
        kind: ExportedFileType::Manifest,
        executable: false,
    });

    Ok(tree)
}

/// Render a plugin into an [`ExportedTree`] for a runtime that only
/// supports skills, agents, and scripts — no hooks and no MCP servers.
/// Roles travel here too: they need no capability.
///
/// Used by [`crate::runtimes::NpmPackage`] and any future runtime that
/// doesn't implement [`HookCapability`] or [`McpCapability`].
///
/// Hooks in the bundle are **silently ignored** rather than raising an
/// error: the bundle may carry them for other runtimes.
pub fn render_plugin_no_mcp_no_hooks<R>(runtime: &R, bundle: &PluginBundle) -> Result<ExportedTree>
where
    R: SkillCapability + AgentCapability + ScriptCapability,
{
    let mut tree = ExportedTree::new();

    for skill in &bundle.skills {
        tree.extend(runtime.render_skill(skill)?);
    }
    push_roles(&mut tree, bundle);
    for agent in &bundle.agents {
        tree.extend(runtime.render_agent(agent)?);
    }
    for script in &bundle.scripts {
        tree.push(runtime.render_script(script)?);
    }

    tree.push(ExportedFile {
        path: "MANIFEST.md".into(),
        content: render_plugin_manifest(bundle)?.into_bytes(),
        kind: ExportedFileType::Manifest,
        executable: false,
    });

    Ok(tree)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mcp::McpServer;
    use crate::runtimes::{ClaudeCode, NpmPackage};
    use crate::{Agent, Hook, Plugin, PluginBundle, Role, Script, ScriptLanguage, Skill};

    fn sample_bundle() -> PluginBundle {
        let plugin = Plugin {
            name: "Test Plugin".into(),
            slug: "test-plugin".into(),
            namespace: None,
            description: Some("A test plugin".into()),
            version_label: "1.0.0".into(),
            author: None,
            license: None,
            tags: vec![],
            category: None,
        };
        let mut b = PluginBundle::new(plugin);
        b.skills.push(Skill::new("My Skill", "desc", "body"));
        b.agents.push(Agent::new("Reviewer", "reviewer"));
        b.hooks.push(Hook::command("h", "h", "PreToolUse", "echo"));
        b.roles.push(Role {
            name: "Expert Reviewer".into(),
            slug: "expert-reviewer".into(),
            description: Some("Reviews like an expert.".into()),
            body: "You are an expert reviewer.".into(),
            tags: vec![],
        });
        b.scripts.push(Script {
            name: "Lint".into(),
            slug: "lint".into(),
            description: None,
            language: ScriptLanguage::Bash,
            body: "echo hi".into(),
            timeout_ms: 0,
            tags: vec![],
            category: None,
            is_template: false,
        });
        b
    }

    #[test]
    fn render_plugin_full_includes_every_asset_type() {
        let tree = render_plugin(&ClaudeCode, &sample_bundle()).unwrap();
        let paths: Vec<_> = tree
            .iter()
            .map(|f| f.path.to_string_lossy().replace('\\', "/"))
            .collect();
        assert!(paths.iter().any(|p| p.contains("skills/my-skill/SKILL.md")));
        assert!(paths.iter().any(|p| p.contains("agents/reviewer.md")));
        assert!(paths.iter().any(|p| p.contains("hooks.json")));
        assert!(paths.iter().any(|p| p.contains("scripts/lint.sh")));
        assert!(paths.iter().any(|p| p == "MANIFEST.md"));
    }

    #[test]
    fn render_plugin_with_mcp_skips_gracefully_when_bundle_has_no_server_list() {
        // Note: PluginBundle doesn't own mcp_servers — those are passed
        // separately at install time. render_plugin composes without
        // touching MCP. This test documents the current behavior.
        let tree = render_plugin(&ClaudeCode, &sample_bundle()).unwrap();
        let paths: Vec<_> = tree
            .iter()
            .map(|f| f.path.to_string_lossy().replace('\\', "/"))
            .collect();
        assert!(!paths.iter().any(|p| p == ".mcp.json"));
    }

    /// A bundle's roles are authoring content like any other: dropping them
    /// from every export is data loss, so both compositions write them.
    #[test]
    fn every_composition_renders_the_bundle_s_roles() {
        for tree in [
            render_plugin(&ClaudeCode, &sample_bundle()).unwrap(),
            render_plugin_no_mcp_no_hooks(&NpmPackage, &sample_bundle()).unwrap(),
        ] {
            let role = tree
                .iter()
                .find(|f| f.path.to_string_lossy() == "roles/expert-reviewer.md")
                .expect("the role travels");
            assert_eq!(role.kind, ExportedFileType::Role);
            assert!(role.text().unwrap().contains("You are an expert reviewer."));
            let manifest = tree
                .iter()
                .find(|f| f.path.to_string_lossy() == "MANIFEST.md")
                .expect("the manifest");
            assert!(manifest.text().unwrap().contains("`expert-reviewer`"));
        }
    }

    #[test]
    fn render_plugin_manifest_is_last() {
        let tree = render_plugin(&ClaudeCode, &sample_bundle()).unwrap();
        let last = tree.iter().last().unwrap();
        assert_eq!(last.path.to_string_lossy(), "MANIFEST.md");
        assert_eq!(last.kind, ExportedFileType::Manifest);
    }

    #[test]
    fn render_plugin_no_mcp_no_hooks_skips_hooks() {
        let tree = render_plugin_no_mcp_no_hooks(&NpmPackage, &sample_bundle()).unwrap();
        let paths: Vec<_> = tree
            .iter()
            .map(|f| f.path.to_string_lossy().replace('\\', "/"))
            .collect();
        assert!(!paths.iter().any(|p| p.contains("hooks.json")));
        assert!(paths.iter().any(|p| p.contains("skills/my-skill")));
    }

    #[test]
    fn render_plugin_propagates_all_assets_including_mcp_server_separately() {
        // The MCP capability is called per-server, not as part of
        // render_plugin. Users who want MCP render it separately and
        // extend the tree:
        let mut tree = render_plugin(&ClaudeCode, &sample_bundle()).unwrap();
        let server = McpServer::http("example", "http://localhost:4243/mcp");
        tree.extend(ClaudeCode.render_mcp_server(&server).unwrap());
        let paths: Vec<_> = tree
            .iter()
            .map(|f| f.path.to_string_lossy().replace('\\', "/"))
            .collect();
        assert!(paths.iter().any(|p| p == ".mcp.json"));
    }
}
