---
type: Harness Fact
title: "Qwen Code: Plugin root variable"
description: "Plugin root variable in Qwen Code, as observed over time."
tags: [skills]
harness: qwen-code
subject: skills/plugin-root-variable
observations:
  - value: {"variable": "${extensionPath}", "substituted_in": ["qwen-extension.json"], "symlinks": "not unwrapped"}
    since: null
    until: null
    observed: "2026-11-04"
    source: qwen-code-extensions
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Is ${extensionPath} substituted inside an extension SKILL.md body or only in qwen-extension.json?"
    observed: "2026-11-04"
    source: qwen-code-extensions
sources:
  - id: qwen-code-extensions
    resource: "https://qwenlm.github.io/qwen-code-docs/en/users/extension/introduction/"
    title: "Qwen Code docs: Extensions"
---

What the sources say about [Plugin root variable](/subjects/skills/plugin-root-variable.md) in [Qwen Code](/harnesses/qwen-code.md).
Variables a skill can use to name its plugin's folder, such as `${CLAUDE_PLUGIN_ROOT}`, and where they are substituted.

## Observations

- 2026-11-04: variable: ${extensionPath}; substituted in: qwen-extension.json; symlinks: not unwrapped. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^qwen-code-extensions]

  > ${extensionPath}: The fully-qualified path of the extension in the user's filesystem.

## Open questions

- Is ${extensionPath} substituted inside an extension SKILL.md body or only in qwen-extension.json?[^qwen-code-extensions]

[^qwen-code-extensions]: Qwen Code docs: Extensions
