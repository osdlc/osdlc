---
type: Harness Fact
title: "Claude Code: Files beside SKILL.md"
description: "Files beside SKILL.md in Claude Code, as observed over time."
tags: [skills]
harness: claude-code
subject: skills/bundled-files
observations:
  - value: {"supported": false, "detail": "supporting files do not load into context every run; SKILL.md should reference them so Claude loads them when needed"}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-skills
    locator: "Add supporting files"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Which tool does Claude use to load a referenced supporting file, and does the harness list the skill's bundled files when the skill loads?"
    observed: "2026-11-04"
    source: claude-code-skills
sources:
  - id: claude-code-skills
    resource: "https://code.claude.com/docs/en/skills"
    title: "Claude Code docs: skills"
---

What the sources say about [Files beside SKILL.md](/subjects/skills/bundled-files.md) in [Claude Code](/harnesses/claude-code.md).
Whether files beside SKILL.md (scripts, references, assets) load into context without being asked for.

## Observations

- 2026-11-04: supported: no; detail: supporting files do not load into context every run; SKILL.md should reference them so Claude loads them when needed. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^claude-code-skills]

  > Large reference docs, API specifications, or example collections don't need to load into context every time the skill runs.

## Open questions

- Which tool does Claude use to load a referenced supporting file, and does the harness list the skill's bundled files when the skill loads?[^claude-code-skills]

[^claude-code-skills]: Claude Code docs: skills
