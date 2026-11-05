---
type: Harness Fact
title: "Antigravity CLI: Skill edits mid-session"
description: "Skill edits mid-session in Antigravity CLI, as observed over time."
tags: [skills]
harness: antigravity
subject: skills/live-reload
observations:
  - value: {"supported": "partial", "cli": "/skills reload or a new conversation"}
    since: null
    until: null
    observed: "2026-11-04"
    source: antigravity-skills
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Does an edit to an existing skill take effect without /skills reload, and what is the App and IDE behavior?"
    observed: "2026-11-04"
    source: antigravity-skills
sources:
  - id: antigravity-skills
    resource: "https://antigravity.google/docs/skills"
    title: "Antigravity docs: Agent skills"
---

What the sources say about [Skill edits mid-session](/subjects/skills/live-reload.md) in [Antigravity CLI](/harnesses/antigravity.md).
Whether adding or editing a skill takes effect in a running session, or needs a restart.

## Observations

- 2026-11-04: supported: partial; cli: /skills reload or a new conversation. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^antigravity-skills]

  > If you add a skill while the CLI is running, run `/skills reload` or start a new conversation to update the slash commands.

## Open questions

- Does an edit to an existing skill take effect without /skills reload, and what is the App and IDE behavior?[^antigravity-skills]

[^antigravity-skills]: Antigravity docs: Agent skills
