---
type: Harness Fact
title: "Agent Skills (agentskills.io): Unknown frontmatter keys"
description: "Unknown frontmatter keys in Agent Skills (agentskills.io), as observed over time."
tags: [skill-frontmatter]
harness: agent-skills
subject: skill-frontmatter/unknown-keys
observations: []
open:
  - question: "What should a client do with a frontmatter key not in the spec (ignore, warn, reject)? The spec lists name, description, license, compatibility, metadata and allowed-tools and does not say."
    observed: "2026-11-04"
    source: agentskills-specification
sources:
  - id: agentskills-specification
    resource: "https://agentskills.io/specification"
    title: "Agent Skills specification"
---

What the sources say about [Unknown frontmatter keys](/subjects/skill-frontmatter/unknown-keys.md) in [Agent Skills (agentskills.io)](/harnesses/agent-skills.md).
What the harness does with a frontmatter key it does not know: ignore it, warn, or reject the skill.

## Open questions

- What should a client do with a frontmatter key not in the spec (ignore, warn, reject)? The spec lists name, description, license, compatibility, metadata and allowed-tools and does not say.[^agentskills-specification]

[^agentskills-specification]: Agent Skills specification
