---
type: Harness Fact
title: "Gemini CLI: Plugin root variable"
description: "Plugin root variable in Gemini CLI, as observed over time."
tags: [skills]
harness: gemini-cli
subject: skills/plugin-root-variable
observations:
  - value: {"variable": "${extensionPath}", "substituted_in": ["gemini-extension.json", "hooks/hooks.json"]}
    since: null
    until: null
    observed: "2026-11-04"
    source: gemini-cli-extensions-reference
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Is ${extensionPath} substituted inside an extension skill SKILL.md body?"
    observed: "2026-11-04"
    source: gemini-cli-skills
sources:
  - id: gemini-cli-extensions-reference
    resource: "https://geminicli.com/docs/extensions/reference/"
    title: "Gemini CLI docs: Extension reference"
  - id: gemini-cli-skills
    resource: "https://geminicli.com/docs/cli/skills/"
    title: "Gemini CLI docs: Agent Skills"
---

What the sources say about [Plugin root variable](/subjects/skills/plugin-root-variable.md) in [Gemini CLI](/harnesses/gemini-cli.md).
Variables a skill can use to name its plugin's folder, such as `${CLAUDE_PLUGIN_ROOT}`, and where they are substituted.

## Observations

- 2026-11-04: variable: ${extensionPath}; substituted in: gemini-extension.json, hooks/hooks.json. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^gemini-cli-extensions-reference]

  > Gemini CLI supports variable substitution in `gemini-extension.json` and `hooks/hooks.json`.

## Open questions

- Is ${extensionPath} substituted inside an extension skill SKILL.md body?[^gemini-cli-skills]

[^gemini-cli-extensions-reference]: Gemini CLI docs: Extension reference
[^gemini-cli-skills]: Gemini CLI docs: Agent Skills
