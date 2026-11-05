---
type: Harness Fact
title: "Codex CLI: Plugin root variable"
description: "Plugin root variable in Codex CLI, as observed over time."
tags: [skills]
harness: codex
subject: skills/plugin-root-variable
observations:
  - value: {"variable": "PLUGIN_ROOT", "resolves_to": "installed plugin root", "also_set": "CLAUDE_PLUGIN_ROOT and CLAUDE_PLUGIN_DATA for compatibility", "documented_use": "lifecycle hook commands, for example ${PLUGIN_ROOT}/hooks/session_start.py"}
    since: null
    until: null
    observed: "2026-11-04"
    source: codex-plugins-build
    locator: "hooks"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Is ${PLUGIN_ROOT} substituted in SKILL.md bodies or in plugin MCP config, or only in hook commands?"
    observed: "2026-11-04"
    source: codex-skills
sources:
  - id: codex-plugins-build
    resource: "https://developers.openai.com/codex/plugins/build"
    title: "Codex docs: build plugins"
  - id: codex-skills
    resource: "https://learn.chatgpt.com/docs/build-skills"
    title: "Codex docs: build skills (redirect target of developers.openai.com/codex/skills)"
---

What the sources say about [Plugin root variable](/subjects/skills/plugin-root-variable.md) in [Codex CLI](/harnesses/codex.md).
Variables a skill can use to name its plugin's folder, such as `${CLAUDE_PLUGIN_ROOT}`, and where they are substituted.

## Observations

- 2026-11-04: variable: PLUGIN_ROOT; resolves to: installed plugin root; also set: CLAUDE_PLUGIN_ROOT and CLAUDE_PLUGIN_DATA for compatibility; documented use: lifecycle hook commands, for example ${PLUGIN_ROOT}/hooks/session_start.py. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^codex-plugins-build]

  > PLUGIN_ROOT points to the installed plugin root

## Open questions

- Is ${PLUGIN_ROOT} substituted in SKILL.md bodies or in plugin MCP config, or only in hook commands?[^codex-skills]

[^codex-plugins-build]: Codex docs: build plugins
[^codex-skills]: Codex docs: build skills (redirect target of developers.openai.com/codex/skills)
