---
type: Harness Fact
title: "Claude Code: How the agent loads a skill"
description: "How the agent loads a skill in Claude Code, as observed over time."
tags: [skills]
harness: claude-code
subject: skills/agent-loading
observations:
  - value: { mechanism: "the `Skill` tool, by name" }
    since: null
    until: null
    observed: "2026-10-01"
    source: claude-skills
    via: skill-naming
    evidence: docs
  - value: {"mechanism": "Skill tool, or user invocation with /skill-name", "body_at_startup": false, "body_on": "invocation, by user or by Claude when relevant"}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-skills
    locator: "Control who invokes a skill"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
  - value: {"after_load": "rendered SKILL.md enters the conversation as one message and stays across turns; file is not re-read"}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-skills
    locator: "Skill content lifecycle"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
  - value: {"built_ins_via_skill_tool": "/init and /security-review"}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-skills
    locator: "Restrict Claude's skill access"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
sources:
  - id: claude-skills
    resource: "https://code.claude.com/docs/en/skills"
    title: "Claude Code docs: skills"
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
  - id: claude-code-skills
    resource: "https://code.claude.com/docs/en/skills"
    title: "Claude Code docs: skills"
---

What the sources say about [How the agent loads a skill](/subjects/skills/agent-loading.md) in
[Claude Code](/harnesses/claude-code.md). How the model loads a skill body, and when: at startup, when the task matches, or only on invocation.

## Observations

- 2026-10-01: mechanism: the `Skill` tool, by name.[^claude-skills][^skill-naming]
- 2026-11-04: mechanism: Skill tool, or user invocation with /skill-name; body at startup: no; body on: invocation, by user or by Claude when relevant. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^claude-code-skills]

  > In a regular session, skill descriptions are loaded into context so Claude knows what's available, but full skill content only loads when invoked.
- 2026-11-04: after load: rendered SKILL.md enters the conversation as one message and stays across turns; file is not re-read. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^claude-code-skills]

  > When you or Claude invoke a skill, the rendered SKILL.md content enters the conversation as a single message and stays there across later turns.
- 2026-11-04: built ins via skill tool: /init and /security-review. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^claude-code-skills]

  > A few built-in commands are also available through the Skill tool, including /init and /security-review.

[^claude-skills]: Claude Code docs: skills
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)
[^claude-code-skills]: Claude Code docs: skills
