---
type: Harness Fact
title: "Cursor: Skill picked from its description"
description: "Skill picked from its description in Cursor, as observed over time."
tags: [skills]
harness: cursor
subject: skills/description-match
observations:
  - value: {"model_picks_from_description": true}
    since: null
    until: null
    observed: "2026-11-04"
    source: cursor-skills
    locator: "Frontmatter fields, description row"
    evidence: docs
  - value: {"missing_description": "agent is unlikely to pick the skill on its own; name invocation still works"}
    since: null
    until: null
    observed: "2026-11-04"
    source: cursor-skills
    locator: "Frontmatter fields (Cloud Agents note)"
    evidence: docs
open:
  - question: "Do the docs give any reliability data for description-based selection, or name a model?"
    observed: "2026-11-04"
    source: cursor-skills
sources:
  - id: cursor-skills
    resource: "https://cursor.com/docs/skills"
    title: "Cursor docs: Agent Skills"
---

What the sources say about [Skill picked from its description](/subjects/skills/description-match.md) in [Cursor](/harnesses/cursor.md).
Whether the model picks a skill from its description alone when the user does not name it.

## Observations

- 2026-11-04: model picks from description: yes.[^cursor-skills]

  > Describes what the skill does and when to use it. Used by the agent to determine relevance.
- 2026-11-04: missing description: agent is unlikely to pick the skill on its own; name invocation still works.[^cursor-skills]

  > Without a description, the agent is unlikely to pick the skill on its own, but you can still invoke it by name.

## Open questions

- Do the docs give any reliability data for description-based selection, or name a model?[^cursor-skills]

[^cursor-skills]: Cursor docs: Agent Skills
