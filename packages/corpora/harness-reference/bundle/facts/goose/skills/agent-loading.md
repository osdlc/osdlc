---
type: Harness Fact
title: "Goose: How the agent loads a skill"
description: "How the agent loads a skill in Goose, as observed over time."
tags: [skills]
harness: goose
subject: skills/agent-loading
observations:
  - value: {"trigger": "request clearly matches a skill, or the user names it", "explicit": "/skills <name> in the CLI"}
    since: null
    until: null
    observed: "2026-11-04"
    source: goose-skills
    locator: "intro"
    evidence: docs
open:
  - question: "What mechanism loads the body (a tool or a file read)?"
    observed: "2026-11-04"
    source: goose-skills
sources:
  - id: goose-skills
    resource: "https://goose-docs.ai/docs/guides/context-engineering/using-skills"
    title: "goose docs: Skills"
---

What the sources say about [How the agent loads a skill](/subjects/skills/agent-loading.md) in [Goose](/harnesses/goose.md).
How the model loads a skill body, and when: at startup, when the task matches, or only on invocation.

## Observations

- 2026-11-04: trigger: request clearly matches a skill, or the user names it; explicit: /skills <name> in the CLI.[^goose-skills]

  > During the session, goose can load a skill's full instructions when:

## Open questions

- What mechanism loads the body (a tool or a file read)?[^goose-skills]

[^goose-skills]: goose docs: Skills
