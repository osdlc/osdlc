---
type: Harness Fact
title: "DeepSeek Harness (dsh): Skill body size"
description: "Skill body size in DeepSeek Harness (dsh), as observed over time."
tags: [skills]
harness: dsh
subject: skills/body-size
observations:
  - value: {"numeric_limit": false, "detail": "loaded instruction bodies have no size cap; only catalog descriptions are truncated"}
    since: null
    until: null
    observed: "2026-11-04"
    source: dsh-tool-skill
    locator: "Known Limitations and Deferred Work"
    evidence: docs
open:
  - question: "Is there a recommendation on SKILL.md body size?"
    observed: "2026-11-04"
    source: dsh-skill-filesystem
sources:
  - id: dsh-tool-skill
    resource: "https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/skill/tool-skill/README.md"
    title: "dsh tool-skill package README"
  - id: dsh-skill-filesystem
    resource: "https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/skill/skill-filesystem/README.md"
    title: "dsh skill-filesystem package README"
---

What the sources say about [Skill body size](/subjects/skills/body-size.md) in [DeepSeek Harness (dsh)](/harnesses/dsh.md).
Limits or guidance on the SKILL.md body size, and what happens past them.

## Observations

- 2026-11-04: numeric limit: no; detail: loaded instruction bodies have no size cap; only catalog descriptions are truncated.[^dsh-tool-skill]

  > **Loaded instruction bodies have no size cap** — a provider can return a skill large enough to consume substantial next-step context; only catalog descriptions are truncated.

## Open questions

- Is there a recommendation on SKILL.md body size?[^dsh-skill-filesystem]

[^dsh-tool-skill]: dsh tool-skill package README
[^dsh-skill-filesystem]: dsh skill-filesystem package README
