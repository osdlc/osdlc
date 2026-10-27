//! Render a [`PluginBundle`] into a human-readable manifest markdown file.
//!
//! The content is plugin metadata, then a list of each asset kind with its
//! name and description. The caller picks the filename; both compositions
//! in [`crate::compose`] write `MANIFEST.md`.

use crate::{PluginBundle, Result, naming::slugify_skill_name};

/// Render a plugin bundle into a markdown manifest string.
///
/// Sections appear in a fixed order (skills → roles → agents → hooks →
/// scripts)
/// and entries within each section follow the order they appear in the
/// bundle. Empty sections are omitted entirely.
///
/// # Errors
///
/// Refuses when a skill's name has no legal slug (see
/// [`slugify_skill_name`]). The manifest advertises each skill as
/// `/<slug>`; an empty slug would advertise a bare `/`, and the plugin it
/// describes cannot be published anyway.
pub fn render_plugin_manifest(bundle: &PluginBundle) -> Result<String> {
    let mut out = String::new();

    out.push_str(&format!("# {}\n\n", bundle.plugin.name));

    if let Some(desc) = bundle.plugin.description.as_deref()
        && !desc.is_empty()
    {
        out.push_str(desc);
        out.push_str("\n\n");
    }

    if let Some(author) = bundle.plugin.author.as_deref()
        && !author.is_empty()
    {
        out.push_str(&format!("**Author:** {author}\n"));
    }

    out.push_str(&format!("**Version:** {}\n\n", bundle.plugin.version_label));

    if !bundle.skills.is_empty() {
        out.push_str("## Skills\n\n");
        for skill in &bundle.skills {
            let slug = slugify_skill_name(&skill.name)?;
            out.push_str(&format!("- `/{slug}`"));
            if !skill.description.is_empty() {
                let first_line = skill.description.lines().next().unwrap_or("");
                out.push_str(&format!(" — {first_line}"));
            }
            out.push('\n');
        }
        out.push('\n');
    }

    if !bundle.roles.is_empty() {
        out.push_str("## Roles\n\n");
        for role in &bundle.roles {
            out.push_str(&format!("- `{}`", role.slug));
            if let Some(desc) = role.description.as_deref()
                && !desc.is_empty()
            {
                let first_line = desc.lines().next().unwrap_or("");
                out.push_str(&format!(" — {first_line}"));
            }
            out.push('\n');
        }
        out.push('\n');
    }

    if !bundle.agents.is_empty() {
        out.push_str("## Agents\n\n");
        for agent in &bundle.agents {
            out.push_str(&format!("- `{}`", agent.slug));
            if let Some(desc) = agent.description.as_deref()
                && !desc.is_empty()
            {
                let first_line = desc.lines().next().unwrap_or("");
                out.push_str(&format!(" — {first_line}"));
            }
            out.push('\n');
        }
        out.push('\n');
    }

    if !bundle.hooks.is_empty() {
        out.push_str("## Hooks\n\n");
        for hook in &bundle.hooks {
            out.push_str(&format!("- `{}` ({})", hook.name, hook.event));
            if let Some(desc) = hook.description.as_deref()
                && !desc.is_empty()
            {
                out.push_str(&format!(" — {desc}"));
            }
            out.push('\n');
        }
        out.push('\n');
    }

    if !bundle.scripts.is_empty() {
        out.push_str("## Scripts\n\n");
        for script in &bundle.scripts {
            out.push_str(&format!("- `{}`", script.slug));
            if let Some(desc) = script.description.as_deref()
                && !desc.is_empty()
            {
                out.push_str(&format!(" — {desc}"));
            }
            out.push('\n');
        }
        out.push('\n');
    }

    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Agent, Hook, Plugin, PluginBundle, Script, ScriptLanguage, Skill};

    fn sample_plugin() -> Plugin {
        Plugin {
            name: "Test Plugin".into(),
            slug: "test-plugin".into(),
            namespace: None,
            description: Some("A sample plugin".into()),
            version_label: "1.0.0".into(),
            author: Some("Author".into()),
            license: None,
            tags: vec![],
            category: None,
        }
    }

    fn sample_bundle() -> PluginBundle {
        let mut b = PluginBundle::new(sample_plugin());
        b.skills
            .push(Skill::new("My Skill", "A short description", "body"));
        b.agents.push(Agent::new("Reviewer", "reviewer"));
        let mut hook = Hook::command("On edit", "on-edit", "PostToolUse", "just lint");
        hook.description = Some("Lint after edit".into());
        hook.matcher = Some("Edit".into());
        hook.timeout_ms = 5000;
        b.hooks.push(hook);
        b.scripts.push(Script {
            name: "Lint".into(),
            slug: "lint".into(),
            description: Some("Runs linter".into()),
            language: ScriptLanguage::Bash,
            body: "cargo clippy".into(),
            timeout_ms: 0,
            tags: vec![],
            category: None,
            is_template: false,
        });
        b
    }

    #[test]
    fn manifest_contains_plugin_header() {
        let m = render_plugin_manifest(&sample_bundle()).unwrap();
        assert!(m.starts_with("# Test Plugin\n"));
        assert!(m.contains("A sample plugin"));
        assert!(m.contains("**Author:** Author"));
        assert!(m.contains("**Version:** 1.0.0"));
    }

    #[test]
    fn manifest_lists_skills_with_slug_and_description() {
        let m = render_plugin_manifest(&sample_bundle()).unwrap();
        assert!(m.contains("## Skills"));
        assert!(m.contains("- `/my-skill` — A short description"));
    }

    #[test]
    fn manifest_lists_all_sections() {
        let m = render_plugin_manifest(&sample_bundle()).unwrap();
        assert!(m.contains("## Skills"));
        assert!(m.contains("## Agents"));
        assert!(m.contains("## Hooks"));
        assert!(m.contains("## Scripts"));
    }

    #[test]
    fn manifest_omits_empty_sections() {
        let m = render_plugin_manifest(&PluginBundle::new(sample_plugin())).unwrap();
        assert!(!m.contains("## Skills"));
        assert!(!m.contains("## Agents"));
        assert!(!m.contains("## Hooks"));
        assert!(!m.contains("## Scripts"));
    }

    #[test]
    fn manifest_refuses_a_skill_with_no_legal_slug() {
        let mut b = sample_bundle();
        b.skills.push(Skill::new("日本語", "d", "body"));
        assert!(render_plugin_manifest(&b).is_err());
    }

    #[test]
    fn manifest_hook_entry_has_event() {
        let m = render_plugin_manifest(&sample_bundle()).unwrap();
        assert!(m.contains("- `On edit` (PostToolUse)"));
    }
}
