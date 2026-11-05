---
type: Harness Fact
title: "Codex CLI: Skill edits mid-session"
description: "Skill edits mid-session in Codex CLI, as observed over time."
tags: [skills]
harness: codex
subject: skills/live-reload
observations:
  - value: {"supported": "partial", "restart_needed": "only if an update does not appear"}
    since: null
    until: null
    observed: "2026-11-04"
    source: codex-skills
    locator: "Live change detection"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
sources:
  - id: codex-skills
    resource: "https://learn.chatgpt.com/docs/build-skills"
    title: "Codex docs: build skills (redirect target of developers.openai.com/codex/skills)"
---

What the sources say about [Skill edits mid-session](/subjects/skills/live-reload.md) in [Codex CLI](/harnesses/codex.md).
Whether adding or editing a skill takes effect in a running session, or needs a restart.

## Observations

- 2026-11-04: supported: partial; restart needed: only if an update does not appear. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^codex-skills]

  > Codex detects skill changes automatically. If an update doesn't appear, restart Codex.

[^codex-skills]: Codex docs: build skills (redirect target of developers.openai.com/codex/skills)
