---
type: Harness Fact
title: "Cursor: How the agent loads a skill"
description: "How the agent loads a skill in Cursor, as observed over time."
tags: [skills]
harness: cursor
subject: skills/agent-loading
observations:
  - value: { mechanism: "selected by description, or explicitly" }
    since: null
    until: null
    observed: "2026-10-01"
    source: cursor-skills
    via: skill-naming
    evidence: docs
  - value: {"progressive": true, "manual_invocation": "type / in Agent chat; attaches the skill to one message"}
    since: null
    until: null
    observed: "2026-11-04"
    source: cursor-skills
    locator: "How skills work"
    evidence: docs
  - value: {"progressive": true}
    since: null
    until: null
    observed: "2026-11-04"
    source: cursor-skills
    locator: "What are skills? / Progressive"
    evidence: docs
open:
  - question: Whether the CLI (cursor-agent) loads skills and plugins the way the IDE does.
    observed: "2026-10-01"
    source: skill-naming
  - question: "What mechanism loads the SKILL.md body when the agent picks a skill (a tool call or a file read)?"
    observed: "2026-11-04"
    source: cursor-skills
sources:
  - id: cursor-skills
    resource: "https://cursor.com/docs/skills"
    title: "Cursor docs: skills"
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [How the agent loads a skill](/subjects/skills/agent-loading.md) in
[Cursor](/harnesses/cursor.md). How the model loads a skill body, and when: at startup, when the task matches, or only on invocation.

## Observations

- 2026-10-01: mechanism: selected by description, or explicitly.[^cursor-skills][^skill-naming]

- 2026-11-04: progressive: yes; manual invocation: type / in Agent chat; attaches the skill to one message.[^cursor-skills]

  > A skill invoked this way attaches to one message.
- 2026-11-04: progressive: yes.[^cursor-skills]

  > Skills load resources on demand, keeping context usage efficient.

## Open questions

- Whether the CLI (cursor-agent) loads skills and plugins the way the IDE does.[^skill-naming]
- What mechanism loads the SKILL.md body when the agent picks a skill (a tool call or a file read)?[^cursor-skills]

[^cursor-skills]: Cursor docs: skills
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)
