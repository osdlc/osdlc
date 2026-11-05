---
type: Harness Fact
title: "DeepSeek Harness (dsh): Duplicate skill names"
description: "Duplicate skill names in DeepSeek Harness (dsh), as observed over time."
tags: [skills]
harness: dsh
subject: skills/duplicate-names
observations:
  - value: {"within_one_layer": "lower rank number wins: project .dsh, project .agents, custom dirs, user .dsh, user .agents", "across_scope_layers": "nearest layer wins outright"}
    since: null
    until: null
    observed: "2026-11-04"
    source: dsh-skills-subsystem
    locator: "docs/subsystems/skills.md:13 at fcc0ad46"
    evidence: source
sources:
  - id: dsh-skills-subsystem
    resource: "https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/docs/subsystems/skills.md"
    title: "dsh skill subsystem reference"
---

What the sources say about [Duplicate skill names](/subjects/skills/duplicate-names.md) in [DeepSeek Harness (dsh)](/harnesses/dsh.md).
What happens when two skills share a name, within one scope or across scopes (project, user, plugin, `.agents/`, `.claude/`): one shadows the other, both are shown, or an error.

## Observations

- 2026-11-04: within one layer: lower rank number wins: project .dsh, project .agents, custom dirs, user .dsh, user .agents; across scope layers: nearest layer wins outright.[^dsh-skills-subsystem]

  > the nearest layer's entry wins a duplicate skill name outright, and the rank order below decides duplicates only within one layer.

[^dsh-skills-subsystem]: dsh skill subsystem reference
