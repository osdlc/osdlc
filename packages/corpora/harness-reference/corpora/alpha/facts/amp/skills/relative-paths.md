---
type: Harness Fact
title: "Amp: Relative paths in SKILL.md"
description: "Relative paths in SKILL.md in Amp, as observed over time."
tags: [skills]
harness: amp
subject: skills/relative-paths
observations:
  - value: {"resolves_from": "skill directory"}
    since: null
    until: null
    observed: "2026-11-04"
    source: amp-skills
    locator: "Skill Format"
    evidence: docs
open:
  - question: "Does Amp tell the model the skill folder when a skill loads?"
    observed: "2026-11-04"
    source: amp-skills
sources:
  - id: amp-skills
    resource: "https://ampcode.com/docs/markdown/customize/skills"
    title: "Amp docs: Skills"
---

What the sources say about [Relative paths in SKILL.md](/subjects/skills/relative-paths.md) in [Amp](/harnesses/amp.md).
What folder a relative path in SKILL.md resolves from, whether the harness tells the model that folder, and whether the model follows it.

## Observations

- 2026-11-04: resolves from: skill directory.[^amp-skills]

  > The agent can access these files by paths relative to the skill directory.

## Open questions

- Does Amp tell the model the skill folder when a skill loads?[^amp-skills]

[^amp-skills]: Amp docs: Skills
