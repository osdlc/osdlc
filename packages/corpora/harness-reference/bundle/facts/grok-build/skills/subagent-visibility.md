---
type: Harness Fact
title: "Grok Build: Skills in subagents"
description: "Skills in subagents in Grok Build, as observed over time."
tags: [skills]
harness: grok-build
subject: skills/subagent-visibility
observations: []
open:
  - question: "Does a subagent see and load the session skills? The subagents guide was searched for \"skill\" and returned only a comparison row listing skills among what an agent definition controls."
    observed: "2026-11-04"
    source: grok-build-skills
sources:
  - id: grok-build-skills
    resource: "https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/08-skills.md"
    title: "Grok Build user guide: Skills"
---

What the sources say about [Skills in subagents](/subjects/skills/subagent-visibility.md) in [Grok Build](/harnesses/grok-build.md).
Whether a subagent sees and can load the session's skills.

## Open questions

- Does a subagent see and load the session skills? The subagents guide was searched for "skill" and returned only a comparison row listing skills among what an agent definition controls.[^grok-build-skills]

[^grok-build-skills]: Grok Build user guide: Skills
