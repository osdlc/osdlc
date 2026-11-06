---
type: Harness Fact
title: "Grok Build: Skill picked from its description"
description: "Skill picked from its description in Grok Build, as observed over time."
tags: [skills]
harness: grok-build
subject: skills/description-match
observations:
  - value: {"supported": true, "fields": ["description", "when-to-use"], "guidance": "name the trigger phrases and use cases"}
    since: null
    until: null
    observed: "2026-11-04"
    source: grok-build-skills
    locator: "crates/codegen/xai-grok-pager/docs/user-guide/08-skills.md:186 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8"
    evidence: source
sources:
  - id: grok-build-skills
    resource: "https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/08-skills.md"
    title: "Grok Build user guide: Skills"
---

What the sources say about [Skill picked from its description](/subjects/skills/description-match.md) in [Grok Build](/harnesses/grok-build.md).
Whether the model picks a skill from its description alone when the user does not name it.

## Observations

- 2026-11-04: supported: yes; fields: description, when-to-use; guidance: name the trigger phrases and use cases.[^grok-build-skills]

  > Grok matches your prompt against the skill's `description` and `when-to-use` fields, so write both to describe the triggering situation.

[^grok-build-skills]: Grok Build user guide: Skills
