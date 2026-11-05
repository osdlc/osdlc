---
type: Harness Fact
title: "Grok Build: Unknown frontmatter keys"
description: "Unknown frontmatter keys in Grok Build, as observed over time."
tags: [skill-frontmatter]
harness: grok-build
subject: skill-frontmatter/unknown-keys
observations: []
open:
  - question: "What happens with a SKILL.md frontmatter key outside the documented core and optional fields?"
    observed: "2026-11-04"
    source: grok-build-skills
sources:
  - id: grok-build-skills
    resource: "https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/08-skills.md"
    title: "Grok Build user guide: Skills"
---

What the sources say about [Unknown frontmatter keys](/subjects/skill-frontmatter/unknown-keys.md) in [Grok Build](/harnesses/grok-build.md).
What the harness does with a frontmatter key it does not know: ignore it, warn, or reject the skill.

## Open questions

- What happens with a SKILL.md frontmatter key outside the documented core and optional fields?[^grok-build-skills]

[^grok-build-skills]: Grok Build user guide: Skills
