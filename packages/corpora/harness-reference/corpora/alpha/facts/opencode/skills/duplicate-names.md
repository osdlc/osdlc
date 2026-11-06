---
type: Harness Fact
title: "OpenCode: Duplicate skill names"
description: "Duplicate skill names in OpenCode, as observed over time."
tags: [skills]
harness: opencode
subject: skills/duplicate-names
observations:
  - value: {"guidance": "names should be unique across all locations"}
    since: null
    until: null
    observed: "2026-11-04"
    source: opencode-skills
    locator: "Troubleshoot loading"
    evidence: docs
open:
  - question: "When two skills share a name, does one shadow the other (which wins) or are both shown?"
    observed: "2026-11-04"
    source: opencode-skills
sources:
  - id: opencode-skills
    resource: "https://opencode.ai/docs/skills"
    title: "OpenCode docs: Agent Skills"
---

What the sources say about [Duplicate skill names](/subjects/skills/duplicate-names.md) in [OpenCode](/harnesses/opencode.md).
What happens when two skills share a name, within one scope or across scopes (project, user, plugin, `.agents/`, `.claude/`): one shadows the other, both are shown, or an error.

## Observations

- 2026-11-04: guidance: names should be unique across all locations.[^opencode-skills]

  > Ensure skill names are unique across all locations

## Open questions

- When two skills share a name, does one shadow the other (which wins) or are both shown?[^opencode-skills]

[^opencode-skills]: OpenCode docs: Agent Skills
