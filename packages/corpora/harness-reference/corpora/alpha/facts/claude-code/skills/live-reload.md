---
type: Harness Fact
title: "Claude Code: Skill edits mid-session"
description: "Skill edits mid-session in Claude Code, as observed over time."
tags: [skills]
harness: claude-code
subject: skills/live-reload
observations:
  - value: {"supported": true, "scope": "~/.claude/skills, project .claude/skills, and .claude/skills inside --add-dir directories", "restart_needed": false, "new_top_level_dir": "a top-level skills directory created after session start needs /reload-skills"}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-skills
    locator: "Edit a skill during a session"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
sources:
  - id: claude-code-skills
    resource: "https://code.claude.com/docs/en/skills"
    title: "Claude Code docs: skills"
---

What the sources say about [Skill edits mid-session](/subjects/skills/live-reload.md) in [Claude Code](/harnesses/claude-code.md).
Whether adding or editing a skill takes effect in a running session, or needs a restart.

## Observations

- 2026-11-04: supported: yes; scope: ~/.claude/skills, project .claude/skills, and .claude/skills inside --add-dir directories; restart needed: no; new top level dir: a top-level skills directory created after session start needs /reload-skills. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^claude-code-skills]

  > When you add, edit, or remove a skill under ~/.claude/skills/, the project .claude/skills/, or a .claude/skills/ inside an --add-dir directory, Claude Code picks up the change within the current session, without a restart.

  > If you create a top-level skills directory that didn't exist when the session started, run /reload-skills

[^claude-code-skills]: Claude Code docs: skills
