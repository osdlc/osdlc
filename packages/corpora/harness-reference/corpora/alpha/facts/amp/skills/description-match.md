---
type: Harness Fact
title: "Amp: Skill picked from its description"
description: "Skill picked from its description in Amp, as observed over time."
tags: [skills]
harness: amp
subject: skills/description-match
observations:
  - value: {"model_picks_from_description": true}
    since: null
    until: null
    observed: "2026-11-04"
    source: amp-skills
    locator: "Skill Format"
    evidence: docs
  - value: {"writing_guidance": "description that says when Amp should use it"}
    since: null
    until: null
    observed: "2026-11-04"
    source: amp-global
    locator: "Create and Test Your Own"
    evidence: docs
sources:
  - id: amp-skills
    resource: "https://ampcode.com/docs/markdown/customize/skills"
    title: "Amp docs: Skills"
  - id: amp-global
    resource: "https://ampcode.com/docs/markdown/customize/global-plugins-and-skills"
    title: "Amp docs: Global Plugins & Skills"
---

What the sources say about [Skill picked from its description](/subjects/skills/description-match.md) in [Amp](/harnesses/amp.md).
Whether the model picks a skill from its description alone when the user does not name it.

## Observations

- 2026-11-04: model picks from description: yes.[^amp-skills]

  > The model sees each skill's `name` and `description` and uses them to decide when to load it.
- 2026-11-04: writing guidance: description that says when Amp should use it.[^amp-global]

  > Give it a name, a description that says when Amp should use it, and the instructions Amp follows.

[^amp-skills]: Amp docs: Skills
[^amp-global]: Amp docs: Global Plugins & Skills
