---
type: Harness Fact
title: "Copilot CLI: Skill edits mid-session"
description: "Skill edits mid-session in Copilot CLI, as observed over time."
tags: [skills]
harness: copilot-cli
subject: skills/live-reload
observations:
  - value: {"supported": "partial", "detail": "a skill added mid-session needs /skills reload"}
    since: null
    until: null
    observed: "2026-11-04"
    source: copilot-cli-add-skills
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
  - value: {"command": "/skills reload reloads skills from all directories"}
    since: null
    until: null
    observed: "2026-11-04"
    source: copilot-cli-command-reference
    locator: "Slash commands"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Are edits to an existing skill picked up without /skills reload?"
    observed: "2026-11-04"
    source: copilot-cli-add-skills
sources:
  - id: copilot-cli-add-skills
    resource: "https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills"
    title: "Copilot docs: add skills to Copilot CLI"
  - id: copilot-cli-command-reference
    resource: "https://docs.github.com/en/copilot/reference/cli-command-reference"
    title: "Copilot docs: CLI command reference"
---

What the sources say about [Skill edits mid-session](/subjects/skills/live-reload.md) in [Copilot CLI](/harnesses/copilot-cli.md).
Whether adding or editing a skill takes effect in a running session, or needs a restart.

## Observations

- 2026-11-04: supported: partial; detail: a skill added mid-session needs /skills reload. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^copilot-cli-add-skills]

  > if you have added a skill during a CLI session, you can add it using the command /skills reload
- 2026-11-04: command: /skills reload reloads skills from all directories. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^copilot-cli-command-reference]

  > /skills reload: Reload skills from all directories.

## Open questions

- Are edits to an existing skill picked up without /skills reload?[^copilot-cli-add-skills]

[^copilot-cli-add-skills]: Copilot docs: add skills to Copilot CLI
[^copilot-cli-command-reference]: Copilot docs: CLI command reference
