---
type: Harness Fact
title: "Amp: Skill discovery walk"
description: "Skill discovery walk in Amp, as observed over time."
tags: [skills]
harness: amp
subject: skills/discovery-walk
observations:
  - value: {"parents": ".agents/skills/ in the project and searched parent directories", "recursive": "up to five directories below each skills root"}
    since: null
    until: null
    observed: "2026-11-04"
    source: amp-skills
    locator: "Skill Sources and Precedence"
    evidence: docs
open:
  - question: "Are symlinked skill folders followed?"
    observed: "2026-11-04"
    source: amp-skills
sources:
  - id: amp-skills
    resource: "https://ampcode.com/docs/markdown/customize/skills"
    title: "Amp docs: Skills"
---

What the sources say about [Skill discovery walk](/subjects/skills/discovery-walk.md) in [Amp](/harnesses/amp.md).
How skill folders are found: parent directories of the working directory, nested directories in a monorepo, and symlinked folders.

## Observations

- 2026-11-04: parents: .agents/skills/ in the project and searched parent directories; recursive: up to five directories below each skills root.[^amp-skills]

  > Amp searches local skill directories recursively, up to five directories below each skills root.

## Open questions

- Are symlinked skill folders followed?[^amp-skills]

[^amp-skills]: Amp docs: Skills
