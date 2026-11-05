---
type: Harness Fact
title: "Grok Build: How the agent loads a skill"
description: "How the agent loads a skill in Grok Build, as observed over time."
tags: [skills]
harness: grok-build
subject: skills/agent-loading
observations:
  - value: {"mechanism": "model invokes the skill on its own, or the user runs /name", "loads": "on invocation, instructions loaded into the conversation"}
    since: null
    until: null
    observed: "2026-11-04"
    source: grok-build-skills
    locator: "crates/codegen/xai-grok-pager/docs/user-guide/08-skills.md:162 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8"
    evidence: source
open:
  - question: "Which tool does the model call to invoke a skill?"
    observed: "2026-11-04"
    source: grok-build-skills
sources:
  - id: grok-build-skills
    resource: "https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/08-skills.md"
    title: "Grok Build user guide: Skills"
---

What the sources say about [How the agent loads a skill](/subjects/skills/agent-loading.md) in [Grok Build](/harnesses/grok-build.md).
How the model loads a skill body, and when: at startup, when the task matches, or only on invocation.

## Observations

- 2026-11-04: mechanism: model invokes the skill on its own, or the user runs /name; loads: on invocation, instructions loaded into the conversation.[^grok-build-skills]

  > Running a skill loads its instructions into the conversation and directs the model to follow them.

## Open questions

- Which tool does the model call to invoke a skill?[^grok-build-skills]

[^grok-build-skills]: Grok Build user guide: Skills
