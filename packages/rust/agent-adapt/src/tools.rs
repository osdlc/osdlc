//! Canonical tool vocabulary and per-runtime name translation.
//!
//! Each coding-agent runtime names the same conceptual tool differently —
//! Claude Code calls it `Read`, Codex
//! calls it `read_file`, OpenCode calls it `read`, Amp calls it `Read`.
//! Authors write skills once using the *canonical* vocabulary defined
//! here, and each runtime's renderer calls
//! [`ToolRegistry::translate_tool_name`] to produce the runtime-specific
//! name at export time.
//!
//! A runtime with no entry here passes every name through unchanged.
//! Antigravity is one: its CLI documentation (read 2026-10-09) names no
//! tool vocabulary, so inventing one would be worse than the canonical
//! spelling.
//!
//! [`ToolRegistry::translate_body_tool_refs`] also rewrites tool
//! references inside skill bodies, longest-first, to avoid `WebSearch`
//! colliding with `Web`.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::RuntimeId;

/// One entry in a [`ToolRegistry`].
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolEntry {
    /// Canonical name used in authored [`crate::Skill::allowed_tools`].
    pub canonical_name: String,
    /// Human-readable description.
    pub description: String,
    /// Per-runtime name overrides. If a runtime is absent, the canonical
    /// name is used as-is.
    pub runtime_names: HashMap<RuntimeId, String>,
}

/// A collection of [`ToolEntry`] values plus translation logic.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolRegistry {
    /// All registered tools.
    pub tools: Vec<ToolEntry>,
}

impl ToolRegistry {
    /// Construct an empty registry. Prefer [`ToolRegistry::default`].
    pub fn empty() -> Self {
        Self { tools: Vec::new() }
    }

    /// Translate a tool name to the runtime-specific name.
    ///
    /// The input may be either the canonical name or *any* runtime-specific
    /// alias (e.g. Claude Code's `Task` for the canonical `Agent`). If
    /// matched, returns the target runtime's name; otherwise returns the
    /// input unchanged so unknown names pass through.
    pub fn translate_tool_name(&self, name: &str, runtime: RuntimeId) -> String {
        for tool in &self.tools {
            let matches =
                tool.canonical_name == name || tool.runtime_names.values().any(|v| v == name);
            if matches {
                return tool
                    .runtime_names
                    .get(&runtime)
                    .cloned()
                    .unwrap_or_else(|| tool.canonical_name.clone());
            }
        }
        name.to_string()
    }

    /// Replace tool references inside free-form text with the target
    /// runtime's vocabulary.
    ///
    /// Both the canonical name and the Claude Code alias (since skill
    /// bodies are typically authored with Claude Code conventions) are
    /// candidate sources.
    ///
    /// A reference matches only as a whole word — `Read` inside `Ready`,
    /// `Bash` inside `Bashful` and `Glob` inside `Global` are prose, not tool
    /// names, and rewriting them corrupts the body. One left-to-right pass
    /// takes the longest mapping that matches at each position, so
    /// `WebSearch` wins over `Web` and a substituted name is never fed back
    /// through a later mapping.
    pub fn translate_body_tool_refs(&self, body: &str, runtime: RuntimeId) -> String {
        let mut mappings: Vec<(String, String)> = Vec::new();

        for tool in &self.tools {
            let Some(target) = tool.runtime_names.get(&runtime).cloned() else {
                continue;
            };

            if tool.canonical_name != target {
                mappings.push((tool.canonical_name.clone(), target.clone()));
            }

            if let Some(cc_name) = tool.runtime_names.get(&RuntimeId::ClaudeCode)
                && *cc_name != tool.canonical_name
                && *cc_name != target
                && !mappings.iter().any(|(src, _)| src == cc_name)
            {
                mappings.push((cc_name.clone(), target.clone()));
            }
        }

        mappings.sort_by_key(|b| std::cmp::Reverse(b.0.len()));

        let bytes = body.as_bytes();
        let mut out = String::with_capacity(body.len());
        let mut at = 0;
        while at < bytes.len() {
            let matched = (at == 0 || !is_word_byte(bytes[at - 1]))
                .then(|| {
                    mappings.iter().find(|(src, _)| {
                        body[at..].starts_with(src.as_str())
                            && bytes.get(at + src.len()).is_none_or(|b| !is_word_byte(*b))
                    })
                })
                .flatten();
            match matched {
                Some((src, dst)) => {
                    out.push_str(dst);
                    at += src.len();
                }
                None => {
                    // A whole character, so a multi-byte one survives intact.
                    let ch = body[at..].chars().next().expect("at is a char boundary");
                    out.push(ch);
                    at += ch.len_utf8();
                }
            }
        }
        out
    }
}

/// What a tool name may not sit against on either side. Non-ASCII counts as a
/// word byte: a name butted against a letter outside ASCII is no more a
/// reference than one butted against `a`.
fn is_word_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_' || !byte.is_ascii()
}

impl Default for ToolRegistry {
    /// Registry populated with the 11 standard coding-agent tools.
    fn default() -> Self {
        Self {
            tools: vec![
                entry(
                    "Read",
                    "Read file contents",
                    &[
                        (RuntimeId::ClaudeCode, "Read"),
                        (RuntimeId::OpenCode, "read"),
                        (RuntimeId::CodexCli, "read_file"),
                        (RuntimeId::Amp, "Read"),
                    ],
                ),
                entry(
                    "Write",
                    "Write/create files",
                    &[
                        (RuntimeId::ClaudeCode, "Write"),
                        (RuntimeId::OpenCode, "write"),
                        (RuntimeId::CodexCli, "write_file"),
                        (RuntimeId::Amp, "create_file"),
                    ],
                ),
                entry(
                    "Edit",
                    "Edit existing files with search-and-replace",
                    &[
                        (RuntimeId::ClaudeCode, "Edit"),
                        (RuntimeId::OpenCode, "edit"),
                        (RuntimeId::CodexCli, "edit_file"),
                        (RuntimeId::Amp, "edit_file"),
                    ],
                ),
                entry(
                    "Bash",
                    "Execute shell commands",
                    &[
                        (RuntimeId::ClaudeCode, "Bash"),
                        (RuntimeId::OpenCode, "run_shell_command"),
                        (RuntimeId::CodexCli, "shell"),
                        (RuntimeId::Amp, "Bash"),
                        // Cursor's only documented tool vocabulary is its
                        // permission tokens, and `Shell(…)` is the one of
                        // them that is not already the canonical spelling.
                        // See `runtimes::cursor`'s "Tool names".
                        (RuntimeId::Cursor, "Shell"),
                    ],
                ),
                entry(
                    "Glob",
                    "Find files by glob pattern",
                    &[
                        (RuntimeId::ClaudeCode, "Glob"),
                        (RuntimeId::OpenCode, "glob"),
                        (RuntimeId::CodexCli, "glob"),
                        (RuntimeId::Amp, "glob"),
                    ],
                ),
                entry(
                    "Grep",
                    "Search file contents with regex",
                    &[
                        (RuntimeId::ClaudeCode, "Grep"),
                        (RuntimeId::OpenCode, "grep"),
                        (RuntimeId::CodexCli, "grep"),
                        (RuntimeId::Amp, "Grep"),
                    ],
                ),
                entry(
                    "Agent",
                    "Launch sub-agents for complex tasks",
                    &[
                        (RuntimeId::ClaudeCode, "Task"),
                        (RuntimeId::OpenCode, "task"),
                        (RuntimeId::CodexCli, "spawn_agent"),
                        (RuntimeId::Amp, "Task"),
                    ],
                ),
                entry(
                    "WebFetch",
                    "Fetch and process web content",
                    &[
                        (RuntimeId::ClaudeCode, "WebFetch"),
                        (RuntimeId::OpenCode, "web_fetch"),
                        (RuntimeId::CodexCli, "web_fetch"),
                        (RuntimeId::Amp, "read_web_page"),
                    ],
                ),
                entry(
                    "WebSearch",
                    "Search the web",
                    &[
                        (RuntimeId::ClaudeCode, "WebSearch"),
                        (RuntimeId::OpenCode, "web_search"),
                        (RuntimeId::CodexCli, "web_search"),
                        (RuntimeId::Amp, "web_search"),
                    ],
                ),
                entry(
                    "NotebookEdit",
                    "Edit Jupyter notebook cells",
                    &[
                        (RuntimeId::ClaudeCode, "NotebookEdit"),
                        (RuntimeId::OpenCode, "NotebookEdit"),
                        (RuntimeId::CodexCli, "NotebookEdit"),
                        (RuntimeId::Amp, "NotebookEdit"),
                    ],
                ),
                entry(
                    "LSP",
                    "Language Server Protocol operations",
                    &[
                        (RuntimeId::ClaudeCode, "LSP"),
                        (RuntimeId::OpenCode, "LSP"),
                        (RuntimeId::CodexCli, "LSP"),
                        (RuntimeId::Amp, "get_diagnostics"),
                    ],
                ),
            ],
        }
    }
}

fn entry(canonical: &str, description: &str, mappings: &[(RuntimeId, &str)]) -> ToolEntry {
    ToolEntry {
        canonical_name: canonical.to_string(),
        description: description.to_string(),
        runtime_names: mappings
            .iter()
            .map(|(rt, name)| (*rt, (*name).to_string()))
            .collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_registry_has_11_tools() {
        assert_eq!(ToolRegistry::default().tools.len(), 11);
    }

    #[test]
    fn every_tool_has_all_runtime_mappings() {
        let registry = ToolRegistry::default();
        let required = [
            RuntimeId::ClaudeCode,
            RuntimeId::OpenCode,
            RuntimeId::CodexCli,
            RuntimeId::Amp,
        ];
        for tool in &registry.tools {
            for rt in required {
                assert!(
                    tool.runtime_names.contains_key(&rt),
                    "{} missing mapping for {rt:?}",
                    tool.canonical_name
                );
            }
        }
    }

    #[test]
    fn translate_by_canonical_name() {
        let r = ToolRegistry::default();
        assert_eq!(
            r.translate_tool_name("Read", RuntimeId::CodexCli),
            "read_file"
        );
        assert_eq!(r.translate_tool_name("Bash", RuntimeId::CodexCli), "shell");
        assert_eq!(r.translate_tool_name("Edit", RuntimeId::OpenCode), "edit");
    }

    #[test]
    fn translate_by_runtime_alias() {
        let r = ToolRegistry::default();
        assert_eq!(r.translate_tool_name("Task", RuntimeId::OpenCode), "task");
        assert_eq!(
            r.translate_tool_name("Task", RuntimeId::CodexCli),
            "spawn_agent"
        );
    }

    #[test]
    fn translate_unknown_passes_through() {
        let r = ToolRegistry::default();
        assert_eq!(
            r.translate_tool_name("SomeCustomTool", RuntimeId::CodexCli),
            "SomeCustomTool"
        );
    }

    #[test]
    fn body_refs_replaces_canonical_names() {
        let r = ToolRegistry::default();
        let body = "Use Read and Write tools";
        assert_eq!(
            r.translate_body_tool_refs(body, RuntimeId::CodexCli),
            "Use read_file and write_file tools"
        );
    }

    #[test]
    fn body_refs_replaces_runtime_alias() {
        let r = ToolRegistry::default();
        let body = "Use Task to delegate work";
        let result = r.translate_body_tool_refs(body, RuntimeId::OpenCode);
        assert!(result.contains("task"));
    }

    #[test]
    fn body_refs_longest_first_avoids_partial_match() {
        let r = ToolRegistry::default();
        let body = "WebSearch for results";
        let result = r.translate_body_tool_refs(body, RuntimeId::CodexCli);
        assert!(result.contains("web_search"));
    }

    /// Prose that merely contains a tool name as a substring is not a tool
    /// reference and must survive untouched.
    #[test]
    fn body_refs_match_whole_words_only() {
        let r = ToolRegistry::default();
        let body = "Ready to ship? Reader beware. Global config file. Grepper tool. Bashful mode.";
        assert_eq!(r.translate_body_tool_refs(body, RuntimeId::CodexCli), body);
        // The real references beside them still translate.
        assert_eq!(
            r.translate_body_tool_refs("Ready? Use Read.", RuntimeId::CodexCli),
            "Ready? Use read_file."
        );
    }

    /// One pass, so a name substituted by one mapping is never re-read by a
    /// later one.
    #[test]
    fn body_refs_do_not_retranslate_their_own_output() {
        let r = ToolRegistry::default();
        let once = r.translate_body_tool_refs("Use Read then Write.", RuntimeId::CodexCli);
        assert_eq!(once, "Use read_file then write_file.");
    }

    /// Antigravity's pages document no tool vocabulary, so it has no entries
    /// and every canonical name passes through unchanged.
    #[test]
    fn antigravity_passes_every_tool_through() {
        let r = ToolRegistry::default();
        for tool in &r.tools {
            assert!(!tool.runtime_names.contains_key(&RuntimeId::Antigravity));
            assert_eq!(
                r.translate_tool_name(&tool.canonical_name, RuntimeId::Antigravity),
                tool.canonical_name
            );
        }
    }
}
