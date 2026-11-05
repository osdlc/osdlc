---
type: Harness Fact
title: "Amp: Skills in context at startup"
description: "Skills in context at startup in Amp, as observed over time."
tags: [skills]
harness: amp
subject: skills/startup-context
observations:
  - value: {"listed": "name and description of every discovered skill"}
    since: null
    until: null
    observed: "2026-11-04"
    source: amp-skills
    locator: "Skill Format"
    evidence: docs
  - value: {"hosted_repository_cap": "200 skills per personal or workspace repository", "beyond_cap": "first 200 directories in alphabetical order; the rest unavailable"}
    since: null
    until: null
    observed: "2026-11-04"
    source: amp-skills
    locator: "Hosted repository limits"
    evidence: docs
    note: "Applies to hosted repositories only."
open:
  - question: "Is the description length capped in the startup list, or the number of local skills?"
    observed: "2026-11-04"
    source: amp-skills
sources:
  - id: amp-skills
    resource: "https://ampcode.com/docs/markdown/customize/skills"
    title: "Amp docs: Skills"
---

What the sources say about [Skills in context at startup](/subjects/skills/startup-context.md) in [Amp](/harnesses/amp.md).
What sits in the model's context before any skill is used: names and descriptions only, or more, and any cap or truncation of the list.

## Observations

- 2026-11-04: listed: name and description of every discovered skill.[^amp-skills]

  > Amp lists every discovered skill for the model. The model sees each skill's `name` and `description`
- 2026-11-04: hosted repository cap: 200 skills per personal or workspace repository; beyond cap: first 200 directories in alphabetical order; the rest unavailable. Applies to hosted repositories only.[^amp-skills]

  > If a Git push puts more than 200 skills in a repository, Amp selects only the first 200 skill directories in alphabetical order.

## Open questions

- Is the description length capped in the startup list, or the number of local skills?[^amp-skills]

[^amp-skills]: Amp docs: Skills
