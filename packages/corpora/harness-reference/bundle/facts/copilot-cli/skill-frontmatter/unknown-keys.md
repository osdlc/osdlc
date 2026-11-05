---
type: Harness Fact
title: "Copilot CLI: Unknown frontmatter keys"
description: "Unknown frontmatter keys in Copilot CLI, as observed over time."
tags: [skill-frontmatter]
harness: copilot-cli
subject: skill-frontmatter/unknown-keys
observations: []
open:
  - question: "What does Copilot CLI do with an unknown SKILL.md frontmatter key (ignore, warn, reject)? Only plugin.json unknown fields are documented (reported and ignored)."
    observed: "2026-11-04"
    source: copilot-cli-add-skills
sources:
  - id: copilot-cli-add-skills
    resource: "https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills"
    title: "Copilot docs: add skills to Copilot CLI"
---

What the sources say about [Unknown frontmatter keys](/subjects/skill-frontmatter/unknown-keys.md) in [Copilot CLI](/harnesses/copilot-cli.md).
What the harness does with a frontmatter key it does not know: ignore it, warn, or reject the skill.

## Open questions

- What does Copilot CLI do with an unknown SKILL.md frontmatter key (ignore, warn, reject)? Only plugin.json unknown fields are documented (reported and ignored).[^copilot-cli-add-skills]

[^copilot-cli-add-skills]: Copilot docs: add skills to Copilot CLI
