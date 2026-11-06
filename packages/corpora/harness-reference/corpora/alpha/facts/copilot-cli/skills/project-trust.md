---
type: Harness Fact
title: "Copilot CLI: Project skills and folder trust"
description: "Project skills and folder trust in Copilot CLI, as observed over time."
tags: [skills]
harness: copilot-cli
subject: skills/project-trust
observations:
  - value: {"added_dirs": "skills from --add-dir are loaded as trusted configurations; same trust as project skills"}
    since: null
    until: null
    observed: "2026-11-04"
    source: copilot-cli-command-reference
    locator: "Skill locations, --add-dir"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Do project skills in .github/skills load only after the user trusts the folder?"
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

What the sources say about [Project skills and folder trust](/subjects/skills/project-trust.md) in [Copilot CLI](/harnesses/copilot-cli.md).
Whether project skills load only after the user trusts the folder.

## Observations

- 2026-11-04: added dirs: skills from --add-dir are loaded as trusted configurations; same trust as project skills. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^copilot-cli-command-reference]

  > This is a trust decision: added skills run with the same trust as project skills.

## Open questions

- Do project skills in .github/skills load only after the user trusts the folder?[^copilot-cli-add-skills]

[^copilot-cli-command-reference]: Copilot docs: CLI command reference
[^copilot-cli-add-skills]: Copilot docs: add skills to Copilot CLI
