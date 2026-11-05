---
type: Harness Fact
title: "Copilot CLI: Relative paths in SKILL.md"
description: "Relative paths in SKILL.md in Copilot CLI, as observed over time."
tags: [skills]
harness: copilot-cli
subject: skills/relative-paths
observations: []
open:
  - question: "What folder does a relative path inside SKILL.md resolve from, and does Copilot CLI tell the model the skill's base directory? (The add-skills page only shows an example saying \"this skill's base directory\".)"
    observed: "2026-11-04"
    source: copilot-cli-add-skills
sources:
  - id: copilot-cli-add-skills
    resource: "https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills"
    title: "Copilot docs: add skills to Copilot CLI"
---

What the sources say about [Relative paths in SKILL.md](/subjects/skills/relative-paths.md) in [Copilot CLI](/harnesses/copilot-cli.md).
What folder a relative path in SKILL.md resolves from, whether the harness tells the model that folder, and whether the model follows it.

## Open questions

- What folder does a relative path inside SKILL.md resolve from, and does Copilot CLI tell the model the skill's base directory? (The add-skills page only shows an example saying "this skill's base directory".)[^copilot-cli-add-skills]

[^copilot-cli-add-skills]: Copilot docs: add skills to Copilot CLI
