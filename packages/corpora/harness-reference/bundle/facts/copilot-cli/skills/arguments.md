---
type: Harness Fact
title: "Copilot CLI: Skill arguments"
description: "Skill arguments in Copilot CLI, as observed over time."
tags: [skills]
harness: copilot-cli
subject: skills/arguments
observations:
  - value: {"frontmatter_field": "argument-hint (optional)", "invocation": "/SKILL-NAME"}
    since: null
    until: null
    observed: "2026-11-04"
    source: copilot-cli-command-reference
    locator: "Skill frontmatter table"
    evidence: docs
    note: "Table row; the fetch tool listed the field names. Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "How does text typed after /skill-name reach the skill body (placeholder, appended text, or not supported)?"
    observed: "2026-11-04"
    source: copilot-cli-add-skills
sources:
  - id: copilot-cli-command-reference
    resource: "https://docs.github.com/en/copilot/reference/cli-command-reference"
    title: "Copilot docs: CLI command reference"
  - id: copilot-cli-add-skills
    resource: "https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills"
    title: "Copilot docs: add skills to Copilot CLI"
---

What the sources say about [Skill arguments](/subjects/skills/arguments.md) in [Copilot CLI](/harnesses/copilot-cli.md).
How text typed after a skill invocation reaches the skill.

## Observations

- 2026-11-04: frontmatter field: argument-hint (optional); invocation: /SKILL-NAME. Table row; the fetch tool listed the field names. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^copilot-cli-command-reference]

  > argument-hint (optional)

## Open questions

- How does text typed after /skill-name reach the skill body (placeholder, appended text, or not supported)?[^copilot-cli-add-skills]

[^copilot-cli-command-reference]: Copilot docs: CLI command reference
[^copilot-cli-add-skills]: Copilot docs: add skills to Copilot CLI
