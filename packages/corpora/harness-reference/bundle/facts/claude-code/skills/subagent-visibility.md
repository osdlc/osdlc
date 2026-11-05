---
type: Harness Fact
title: "Claude Code: Skills in subagents"
description: "Skills in subagents in Claude Code, as observed over time."
tags: [skills]
harness: claude-code
subject: skills/subagent-visibility
observations:
  - value: {"inherits_parent_invoked_skills": false, "can_load_skills": true}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-sub-agents
    locator: "Preload skills into subagents"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
  - value: {"preload": "skills frontmatter field injects full skill content at startup, up to the first 32 distinct names"}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-sub-agents
    locator: "Preload skills into subagents"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
  - value: {"fresh_context": "subagent does not see skills the parent already invoked"}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-sub-agents
    locator: "Subagent context"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
  - value: {"disable_with": "omit Skill from tools or add it to disallowedTools"}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-sub-agents
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
sources:
  - id: claude-code-sub-agents
    resource: "https://code.claude.com/docs/en/sub-agents.md"
    title: "Claude Code docs: subagents"
---

What the sources say about [Skills in subagents](/subjects/skills/subagent-visibility.md) in [Claude Code](/harnesses/claude-code.md).
Whether a subagent sees and can load the session's skills.

## Observations

- 2026-11-04: inherits parent invoked skills: no; can load skills: yes. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^claude-code-sub-agents]

  > Without it, the subagent can still discover and invoke project, user, and plugin skills through the Skill tool during execution.
- 2026-11-04: preload: skills frontmatter field injects full skill content at startup, up to the first 32 distinct names. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^claude-code-sub-agents]

  > The full content of each listed skill is injected into the subagent's context at startup, up to the first 32 distinct names in the list.
- 2026-11-04: fresh context: subagent does not see skills the parent already invoked. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^claude-code-sub-agents]

  > It doesn't see your conversation history, the skills you've already invoked, or the files Claude has already read.
- 2026-11-04: disable with: omit Skill from tools or add it to disallowedTools. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^claude-code-sub-agents]

  > To prevent a subagent from invoking skills entirely, omit Skill from the tools list or add it to disallowedTools.

[^claude-code-sub-agents]: Claude Code docs: subagents
