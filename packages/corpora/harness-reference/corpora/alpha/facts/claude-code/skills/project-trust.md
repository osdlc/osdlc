---
type: Harness Fact
title: "Claude Code: Project skills and folder trust"
description: "Project skills and folder trust in Claude Code, as observed over time."
tags: [skills]
harness: claude-code
subject: skills/project-trust
observations:
  - value: {"skill_folder_as_plugin_in_project": "requires accepting the workspace trust dialog"}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-skills
    locator: "Choose where skills load, skill folder as a plugin"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
  - value: {"project_plugins": "load only after the trust check; trusting a parent folder or -p is not enough"}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-plugin-loading
    locator: "Trust check and component limits for repository plugins"
    evidence: docs
  - value: {"allowed_tools_gate": "workspace trust does not gate a project skill's allowed-tools field"}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-skills
    locator: "Pre-approve tools for a skill"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Does a plain project skill (not a plugin folder) appear in the skill listing in a folder the user has not trusted?"
    observed: "2026-11-04"
    source: claude-code-skills
sources:
  - id: claude-code-skills
    resource: "https://code.claude.com/docs/en/skills"
    title: "Claude Code docs: skills"
  - id: claude-code-plugin-loading
    resource: "https://code.claude.com/docs/en/plugins/loading.md"
    title: "Claude Code docs: plugin loading reference"
---

What the sources say about [Project skills and folder trust](/subjects/skills/project-trust.md) in [Claude Code](/harnesses/claude-code.md).
Whether project skills load only after the user trusts the folder.

## Observations

- 2026-11-04: skill folder as plugin in project: requires accepting the workspace trust dialog. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^claude-code-skills]

  > In a project's .claude/skills/, this requires accepting the workspace trust dialog first...
- 2026-11-04: project plugins: load only after the trust check; trusting a parent folder or -p is not enough.[^claude-code-plugin-loading]

  > it loads only after the same trust check that applies to project allow rules in .claude/settings.json. Trusting a parent folder or running with -p isn't enough.
- 2026-11-04: allowed tools gate: workspace trust does not gate a project skill's allowed-tools field. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^claude-code-skills]

  > Workspace trust doesn't gate this field. Claude Code applies a project skill's allowed-tools even in a -p run in a folder you've never trusted.

## Open questions

- Does a plain project skill (not a plugin folder) appear in the skill listing in a folder the user has not trusted?[^claude-code-skills]

[^claude-code-skills]: Claude Code docs: skills
[^claude-code-plugin-loading]: Claude Code docs: plugin loading reference
