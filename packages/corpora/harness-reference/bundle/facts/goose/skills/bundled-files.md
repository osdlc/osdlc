---
type: Harness Fact
title: "Goose: Files beside SKILL.md"
description: "Files beside SKILL.md in Goose, as observed over time."
tags: [skills]
harness: goose
subject: skills/bundled-files
observations:
  - value: {"seen_on_load": "supporting files", "access": "Developer extension file tools"}
    since: null
    until: null
    observed: "2026-11-04"
    source: goose-skills
    locator: "Supporting Files"
    evidence: docs
open:
  - question: "Does loading a skill put supporting file contents (not just names) in context?"
    observed: "2026-11-04"
    source: goose-skills
sources:
  - id: goose-skills
    resource: "https://goose-docs.ai/docs/guides/context-engineering/using-skills"
    title: "goose docs: Skills"
---

What the sources say about [Files beside SKILL.md](/subjects/skills/bundled-files.md) in [Goose](/harnesses/goose.md).
Whether files beside SKILL.md (scripts, references, assets) load into context without being asked for.

## Observations

- 2026-11-04: seen on load: supporting files; access: Developer extension file tools.[^goose-skills]

  > When goose loads the skill, it sees the supporting files and can access them using the [Developer extension's](/docs/mcp/developer-mcp) file tools.

## Open questions

- Does loading a skill put supporting file contents (not just names) in context?[^goose-skills]

[^goose-skills]: goose docs: Skills
