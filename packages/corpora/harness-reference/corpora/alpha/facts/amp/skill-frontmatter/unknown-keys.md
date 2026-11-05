---
type: Harness Fact
title: "Amp: Unknown frontmatter keys"
description: "Unknown frontmatter keys in Amp, as observed over time."
tags: [skill-frontmatter]
harness: amp
subject: skill-frontmatter/unknown-keys
observations: []
open:
  - question: "What happens with an unrecognized frontmatter key? The skills page documents name, description, mcpServers, builtin-tools (plugin skills) only."
    observed: "2026-11-04"
    source: amp-skills
sources:
  - id: amp-skills
    resource: "https://ampcode.com/docs/markdown/customize/skills"
    title: "Amp docs: Skills"
---

What the sources say about [Unknown frontmatter keys](/subjects/skill-frontmatter/unknown-keys.md) in [Amp](/harnesses/amp.md).
What the harness does with a frontmatter key it does not know: ignore it, warn, or reject the skill.

## Open questions

- What happens with an unrecognized frontmatter key? The skills page documents name, description, mcpServers, builtin-tools (plugin skills) only.[^amp-skills]

[^amp-skills]: Amp docs: Skills
