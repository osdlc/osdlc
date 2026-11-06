---
type: Harness Fact
title: "Amp: Skill body size"
description: "Skill body size in Amp, as observed over time."
tags: [skills]
harness: amp
subject: skills/body-size
observations:
  - value: {"hosted_max_file": "10 MiB", "hosted_max_skill": "25 MiB", "hosted_max_files_per_skill": "200", "applies_to_local": false}
    since: null
    until: null
    observed: "2026-11-04"
    source: amp-skills
    locator: "Hosted repository limits"
    evidence: docs
    note: "Hosted repositories only; no SKILL.md body guidance."
open:
  - question: "Is there a limit or recommendation on SKILL.md body length for local skills?"
    observed: "2026-11-04"
    source: amp-skills
sources:
  - id: amp-skills
    resource: "https://ampcode.com/docs/markdown/customize/skills"
    title: "Amp docs: Skills"
---

What the sources say about [Skill body size](/subjects/skills/body-size.md) in [Amp](/harnesses/amp.md).
Limits or guidance on the SKILL.md body size, and what happens past them.

## Observations

- 2026-11-04: hosted max file: 10 MiB; hosted max skill: 25 MiB; hosted max files per skill: 200; applies to local: no. Hosted repositories only; no SKILL.md body guidance.[^amp-skills]

  > | Total size of one skill               | 25 MiB |

## Open questions

- Is there a limit or recommendation on SKILL.md body length for local skills?[^amp-skills]

[^amp-skills]: Amp docs: Skills
