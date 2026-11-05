---
type: Harness Fact
title: "Gemini CLI: Skill edits mid-session"
description: "Skill edits mid-session in Gemini CLI, as observed over time."
tags: [skills]
harness: gemini-cli
subject: skills/live-reload
observations:
  - value: {"supported": "partial", "command": "/skills reload"}
    since: null
    until: null
    observed: "2026-11-04"
    source: gemini-cli-skills-tutorial
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
  - value: {"scope": "extensions", "restart_needed": true}
    since: null
    until: null
    observed: "2026-11-04"
    source: gemini-cli-extensions-reference
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Does a skill file edited or added on disk, without running /skills reload, take effect in a running session?"
    observed: "2026-11-04"
    source: gemini-cli-skills
sources:
  - id: gemini-cli-skills-tutorial
    resource: "https://geminicli.com/docs/cli/tutorials/skills-getting-started/"
    title: "Gemini CLI docs: Getting started with skills"
  - id: gemini-cli-extensions-reference
    resource: "https://geminicli.com/docs/extensions/reference/"
    title: "Gemini CLI docs: Extension reference"
  - id: gemini-cli-skills
    resource: "https://geminicli.com/docs/cli/skills/"
    title: "Gemini CLI docs: Agent Skills"
---

What the sources say about [Skill edits mid-session](/subjects/skills/live-reload.md) in [Gemini CLI](/harnesses/gemini-cli.md).
Whether adding or editing a skill takes effect in a running session, or needs a restart.

## Observations

- 2026-11-04: supported: partial; command: /skills reload. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^gemini-cli-skills-tutorial]

  > run `/skills reload` to refresh the list without restarting the session.
- 2026-11-04: scope: extensions; restart needed: yes. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^gemini-cli-extensions-reference]

  > All management operations, including updates to slash commands, take effect only after you restart the CLI session.

## Open questions

- Does a skill file edited or added on disk, without running /skills reload, take effect in a running session?[^gemini-cli-skills]

[^gemini-cli-skills-tutorial]: Gemini CLI docs: Getting started with skills
[^gemini-cli-extensions-reference]: Gemini CLI docs: Extension reference
[^gemini-cli-skills]: Gemini CLI docs: Agent Skills
