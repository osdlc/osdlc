---
type: Harness Fact
title: "Copilot CLI: Files beside SKILL.md"
description: "Files beside SKILL.md in Copilot CLI, as observed over time."
tags: [skills]
harness: copilot-cli
subject: skills/bundled-files
observations:
  - value: {"supported": "partial", "detail": "docs say Copilot discovers all files in the skill directory; whether contents enter context is not stated"}
    since: null
    until: null
    observed: "2026-11-04"
    source: copilot-cli-add-skills
    locator: "Using agent skills"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Do files beside SKILL.md load into context automatically, or only when the model reads them?"
    observed: "2026-11-04"
    source: copilot-cli-add-skills
sources:
  - id: copilot-cli-add-skills
    resource: "https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills"
    title: "Copilot docs: add skills to Copilot CLI"
---

What the sources say about [Files beside SKILL.md](/subjects/skills/bundled-files.md) in [Copilot CLI](/harnesses/copilot-cli.md).
Whether files beside SKILL.md (scripts, references, assets) load into context without being asked for.

## Observations

- 2026-11-04: supported: partial; detail: docs say Copilot discovers all files in the skill directory; whether contents enter context is not stated. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^copilot-cli-add-skills]

  > Copilot automatically discovers all of the files in the skill's directory

## Open questions

- Do files beside SKILL.md load into context automatically, or only when the model reads them?[^copilot-cli-add-skills]

[^copilot-cli-add-skills]: Copilot docs: add skills to Copilot CLI
