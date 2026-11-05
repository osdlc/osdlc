---
type: Harness Fact
title: "Grok Build: Skill arguments"
description: "Skill arguments in Grok Build, as observed over time."
tags: [skills]
harness: grok-build
subject: skills/arguments
observations:
  - value: {"mechanism": "text typed after the slash command name is passed as arguments", "hint_field": "argument-hint (autocomplete hint only)"}
    since: null
    until: null
    observed: "2026-11-04"
    source: grok-build-skills
    locator: "crates/codegen/xai-grok-pager/docs/user-guide/08-skills.md:162 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8"
    evidence: source
    note: "The page does not name a placeholder such as $ARGUMENTS."
open:
  - question: "How do the arguments appear in the skill body: a placeholder or appended text?"
    observed: "2026-11-04"
    source: grok-build-skills
sources:
  - id: grok-build-skills
    resource: "https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/08-skills.md"
    title: "Grok Build user guide: Skills"
---

What the sources say about [Skill arguments](/subjects/skills/arguments.md) in [Grok Build](/harnesses/grok-build.md).
How text typed after a skill invocation reaches the skill.

## Observations

- 2026-11-04: mechanism: text typed after the slash command name is passed as arguments; hint field: argument-hint (autocomplete hint only). The page does not name a placeholder such as $ARGUMENTS.[^grok-build-skills]

  > To pass arguments, type them after the name:

## Open questions

- How do the arguments appear in the skill body: a placeholder or appended text?[^grok-build-skills]

[^grok-build-skills]: Grok Build user guide: Skills
