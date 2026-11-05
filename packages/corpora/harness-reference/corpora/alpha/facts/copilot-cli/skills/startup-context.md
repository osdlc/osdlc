---
type: Harness Fact
title: "Copilot CLI: Skills in context at startup"
description: "Skills in context at startup in Copilot CLI, as observed over time."
tags: [skills]
harness: copilot-cli
subject: skills/startup-context
observations: []
open:
  - question: "What sits in the model's context at startup for skills (name and description only?), and is there a cap or truncation? The docs fetched do not say."
    observed: "2026-11-04"
    source: copilot-cli-add-skills
sources:
  - id: copilot-cli-add-skills
    resource: "https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills"
    title: "Copilot docs: add skills to Copilot CLI"
---

What the sources say about [Skills in context at startup](/subjects/skills/startup-context.md) in [Copilot CLI](/harnesses/copilot-cli.md).
What sits in the model's context before any skill is used: names and descriptions only, or more, and any cap or truncation of the list.

## Open questions

- What sits in the model's context at startup for skills (name and description only?), and is there a cap or truncation? The docs fetched do not say.[^copilot-cli-add-skills]

[^copilot-cli-add-skills]: Copilot docs: add skills to Copilot CLI
