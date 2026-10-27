//! Render an [`Agent`] into a markdown file with YAML frontmatter.
//!
//! Used by runtimes that store agent personas as markdown files in an
//! `agents/` directory (Claude Code, Codex CLI, OpenCode, Amp).
//! The shape is: frontmatter with the agent's metadata + tool allowlist,
//! followed by the system prompt as the body.

use crate::render::FrontmatterBuilder;
use crate::{Agent, FrontmatterDialect, RuntimeId, ToolRegistry};

/// Render `agent` into a complete markdown file body for the given runtime.
///
/// Each entry in [`Agent::tools`] is passed through
/// `registry.translate_tool_name(_, runtime)` so authors write canonical
/// names once. The [`Agent::system_prompt`] is written verbatim after the
/// closing `---` delimiter; if `None` or empty, only the frontmatter is
/// emitted.
pub fn render_agent_md(
    agent: &Agent,
    runtime: RuntimeId,
    dialect: &FrontmatterDialect,
    registry: &ToolRegistry,
) -> String {
    let translated_tools: Vec<String> = agent
        .tools
        .iter()
        .map(|t| registry.translate_tool_name(t, runtime))
        .collect();

    let mut b = FrontmatterBuilder::new(dialect);
    b.scalar("name", &agent.slug);
    if let Some(desc) = agent.description.as_deref() {
        b.scalar("description", desc);
    }
    if let Some(model) = agent.model.as_deref() {
        b.scalar("model", model);
    }
    if let Some(temp) = agent.temperature {
        b.scalar("temperature", &temp.to_string());
    }
    b.list("allowed_tools", &translated_tools);
    if agent.is_template {
        b.boolean("is_template", true);
    }

    let frontmatter = b.build();

    match agent.system_prompt.as_deref() {
        Some(prompt) if !prompt.is_empty() => format!("{frontmatter}\n{prompt}\n"),
        _ => frontmatter,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Agent, FieldNaming};

    fn dialect() -> FrontmatterDialect {
        FrontmatterDialect {
            field_naming: FieldNaming::Kebab,
            omit_fields: &[],
            emit_user_invocable_default: false,
        }
    }

    fn sample_agent() -> Agent {
        let mut a = Agent::new("Reviewer", "reviewer");
        a.description = Some("Reviews code".into());
        a.model = Some("sonnet".into());
        a.temperature = Some(0.3);
        a.tools = vec!["Read".into(), "Grep".into()];
        a.system_prompt = Some("You are a code reviewer.".into());
        a
    }

    #[test]
    fn renders_name_from_slug() {
        let out = render_agent_md(
            &sample_agent(),
            RuntimeId::ClaudeCode,
            &dialect(),
            &ToolRegistry::default(),
        );
        assert!(out.contains("name: reviewer"));
    }

    #[test]
    fn renders_system_prompt_as_body() {
        let out = render_agent_md(
            &sample_agent(),
            RuntimeId::ClaudeCode,
            &dialect(),
            &ToolRegistry::default(),
        );
        assert!(out.contains("You are a code reviewer."));
    }

    #[test]
    fn translates_tools_for_codex() {
        let out = render_agent_md(
            &sample_agent(),
            RuntimeId::CodexCli,
            &dialect(),
            &ToolRegistry::default(),
        );
        assert!(out.contains("- read_file"));
        assert!(out.contains("- grep"));
    }

    #[test]
    fn is_template_emitted_when_true() {
        let mut a = sample_agent();
        a.is_template = true;
        let out = render_agent_md(
            &a,
            RuntimeId::ClaudeCode,
            &dialect(),
            &ToolRegistry::default(),
        );
        assert!(out.contains("is-template: true"));
    }

    #[test]
    fn temperature_emitted() {
        let out = render_agent_md(
            &sample_agent(),
            RuntimeId::ClaudeCode,
            &dialect(),
            &ToolRegistry::default(),
        );
        assert!(out.contains("temperature: 0.3"));
    }

    #[test]
    fn no_system_prompt_emits_only_frontmatter() {
        let mut a = sample_agent();
        a.system_prompt = None;
        let out = render_agent_md(
            &a,
            RuntimeId::ClaudeCode,
            &dialect(),
            &ToolRegistry::default(),
        );
        assert!(out.ends_with("---\n"));
    }
}
