---
type: Harness Fact
title: "Grok Build: Project skills and folder trust"
description: "Project skills and folder trust in Grok Build, as observed over time."
tags: [skills]
harness: grok-build
subject: skills/project-trust
observations:
  - value: {"supported": true}
    since: null
    until: null
    observed: "2026-11-04"
    source: grok-build-skills
    locator: "crates/codegen/xai-grok-pager/docs/user-guide/08-skills.md:3 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8"
    evidence: source
sources:
  - id: grok-build-skills
    resource: "https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/08-skills.md"
    title: "Grok Build user guide: Skills"
---

What the sources say about [Project skills and folder trust](/subjects/skills/project-trust.md) in [Grok Build](/harnesses/grok-build.md).
Whether project skills load only after the user trusts the folder.

## Observations

- 2026-11-04: supported: yes.[^grok-build-skills]

  > Startup discovery skips project skills and commands in untrusted folders.

[^grok-build-skills]: Grok Build user guide: Skills
