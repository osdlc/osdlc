---
type: Harness Fact
title: "Goose: Relative paths in SKILL.md"
description: "Relative paths in SKILL.md in Goose, as observed over time."
tags: [skills]
harness: goose
subject: skills/relative-paths
observations:
  - value: {"resolves_from": "skill directory", "model_told_location": true}
    since: null
    until: null
    observed: "2026-11-04"
    source: goose-src-skills-mod
    locator: "crates/goose-agent/src/skills/mod.rs:587 at bfe8ccd"
    evidence: source
    note: "A test asserts the loaded skill text contains this sentence."
sources:
  - id: goose-src-skills-mod
    resource: "https://github.com/aaif-goose/goose/blob/bfe8ccd23de1d2c47a4cb2970d522f093ae7f2ba/crates/goose-agent/src/skills/mod.rs"
    title: "goose source: skills/mod.rs (main at bfe8ccd)"
---

What the sources say about [Relative paths in SKILL.md](/subjects/skills/relative-paths.md) in [Goose](/harnesses/goose.md).
What folder a relative path in SKILL.md resolves from, whether the harness tells the model that folder, and whether the model follows it.

## Observations

- 2026-11-04: resolves from: skill directory; model told location: yes. A test asserts the loaded skill text contains this sentence.[^goose-src-skills-mod]

  > Relative paths in this skill resolve from the skill directory

[^goose-src-skills-mod]: goose source: skills/mod.rs (main at bfe8ccd)
