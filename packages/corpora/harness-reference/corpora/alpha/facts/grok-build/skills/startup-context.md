---
type: Harness Fact
title: "Grok Build: Skills in context at startup"
description: "Skills in context at startup in Grok Build, as observed over time."
tags: [skills]
harness: grok-build
subject: skills/startup-context
observations:
  - value: {"listed": "enabled skills appear in the system prompt", "disabled_skills": "kept listed in the UI but excluded from the system prompt"}
    since: null
    until: null
    observed: "2026-11-04"
    source: grok-build-skills
    locator: "crates/codegen/xai-grok-pager/docs/user-guide/08-skills.md:48 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8"
    evidence: source
    note: "Shows skills are in the system prompt; the content per skill is not stated."
open:
  - question: "What does the system prompt list per skill (name, description, when-to-use), and is the count or description length capped?"
    observed: "2026-11-04"
    source: grok-build-skills
sources:
  - id: grok-build-skills
    resource: "https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/08-skills.md"
    title: "Grok Build user guide: Skills"
---

What the sources say about [Skills in context at startup](/subjects/skills/startup-context.md) in [Grok Build](/harnesses/grok-build.md).
What sits in the model's context before any skill is used: names and descriptions only, or more, and any cap or truncation of the list.

## Observations

- 2026-11-04: listed: enabled skills appear in the system prompt; disabled skills: kept listed in the UI but excluded from the system prompt. Shows skills are in the system prompt; the content per skill is not stated.[^grok-build-skills]

  > `disabled` keeps it in the list but excludes it from the system prompt and from invocation.

## Open questions

- What does the system prompt list per skill (name, description, when-to-use), and is the count or description length capped?[^grok-build-skills]

[^grok-build-skills]: Grok Build user guide: Skills
