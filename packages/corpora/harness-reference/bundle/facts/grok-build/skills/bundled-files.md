---
type: Harness Fact
title: "Grok Build: Files beside SKILL.md"
description: "Files beside SKILL.md in Grok Build, as observed over time."
tags: [skills]
harness: grok-build
subject: skills/bundled-files
observations:
  - value: {"auto_loaded": false, "guidance": "put long reference material in sibling files and tell Grok to read them"}
    since: null
    until: null
    observed: "2026-11-04"
    source: grok-build-skills
    locator: "crates/codegen/xai-grok-pager/docs/user-guide/08-skills.md:233 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8"
    evidence: source
sources:
  - id: grok-build-skills
    resource: "https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/08-skills.md"
    title: "Grok Build user guide: Skills"
---

What the sources say about [Files beside SKILL.md](/subjects/skills/bundled-files.md) in [Grok Build](/harnesses/grok-build.md).
Whether files beside SKILL.md (scripts, references, assets) load into context without being asked for.

## Observations

- 2026-11-04: auto loaded: no; guidance: put long reference material in sibling files and tell Grok to read them.[^grok-build-skills]

  > Put long reference material in sibling files and tell Grok to read them with a line offset and limit.

[^grok-build-skills]: Grok Build user guide: Skills
