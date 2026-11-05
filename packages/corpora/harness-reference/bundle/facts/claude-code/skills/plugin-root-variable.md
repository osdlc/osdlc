---
type: Harness Fact
title: "Claude Code: Plugin root variable"
description: "Plugin root variable in Claude Code, as observed over time."
tags: [skills]
harness: claude-code
subject: skills/plugin-root-variable
observations:
  - value: {"variable": "${CLAUDE_PLUGIN_ROOT}", "resolves_to": "absolute path of the plugin's installed version", "substituted_in": ["skill, command and agent markdown body", "hook command and args", "MCP stdio command, args, env", "MCP http/sse/ws url, headers, headersHelper", "LSP command, args, env, workspaceFolder"]}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-plugins-reference
    locator: "Environment variables, Where each variable resolves"
    evidence: docs
  - value: {"variable": "${CLAUDE_PLUGIN_DATA}", "resolves_to": "~/.claude/plugins/data/<id>/, kept across updates"}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-plugins-reference
    locator: "Environment variables"
    evidence: docs
  - value: {"not_in_bash_tool_env": true, "substituted_in_skill_also": "allowed-tools Bash rules"}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-plugins-reference
    locator: "Where each variable resolves"
    evidence: docs
  - value: {"skills_substitution_note": "CLAUDE_PLUGIN_ROOT is substituted only in plugin skills"}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-skills
    locator: "Available string substitutions"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
sources:
  - id: claude-code-plugins-reference
    resource: "https://code.claude.com/docs/en/plugins-reference"
    title: "Claude Code docs: plugin manifest reference"
  - id: claude-code-skills
    resource: "https://code.claude.com/docs/en/skills"
    title: "Claude Code docs: skills"
---

What the sources say about [Plugin root variable](/subjects/skills/plugin-root-variable.md) in [Claude Code](/harnesses/claude-code.md).
Variables a skill can use to name its plugin's folder, such as `${CLAUDE_PLUGIN_ROOT}`, and where they are substituted.

## Observations

- 2026-11-04: variable: ${CLAUDE_PLUGIN_ROOT}; resolves to: absolute path of the plugin's installed version; substituted in: skill, command and agent markdown body, hook command and args, MCP stdio command, args, env, MCP http/sse/ws url, headers, headersHelper, LSP command, args, env, workspaceFolder.[^claude-code-plugins-reference]

  > Skill, command, and agent content | Anywhere in the Markdown body | Not applicable
- 2026-11-04: variable: ${CLAUDE_PLUGIN_DATA}; resolves to: ~/.claude/plugins/data/<id>/, kept across updates.[^claude-code-plugins-reference]

  > ~/.claude/plugins/data/<id>/, created on first reference and kept across plugin updates.
- 2026-11-04: not in bash tool env: yes; substituted in skill also: allowed-tools Bash rules.[^claude-code-plugins-reference]

  > The variables aren't present in the environment of commands Claude runs through the Bash tool, in the main session or in a subagent.
- 2026-11-04: skills substitution note: CLAUDE_PLUGIN_ROOT is substituted only in plugin skills. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^claude-code-skills]

  > ${CLAUDE_PLUGIN_ROOT} | The plugin's installation directory. Substituted only in plugin skills.

[^claude-code-plugins-reference]: Claude Code docs: plugin manifest reference
[^claude-code-skills]: Claude Code docs: skills
