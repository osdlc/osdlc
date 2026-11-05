---
type: Harness Fact
title: "Goose: Skill arguments"
description: "Skill arguments in Goose, as observed over time."
tags: [skills]
harness: goose
subject: skills/arguments
observations:
  - value: {"placeholders": ["$ARGUMENTS", "$ARGUMENTS[N]", "$N", "$name (declared argument names)"]}
    since: null
    until: null
    observed: "2026-11-04"
    source: goose-src-arguments
    locator: "crates/goose-agent/src/skills/arguments.rs:37-42 at bfe8ccd"
    evidence: source
  - value: {"no_placeholder": "text \"ARGUMENTS: <args>\" appended after the skill content"}
    since: null
    until: null
    observed: "2026-11-04"
    source: goose-src-arguments
    locator: "crates/goose-agent/src/skills/arguments.rs:59 at bfe8ccd"
    evidence: source
sources:
  - id: goose-src-arguments
    resource: "https://github.com/aaif-goose/goose/blob/bfe8ccd23de1d2c47a4cb2970d522f093ae7f2ba/crates/goose-agent/src/skills/arguments.rs"
    title: "goose source: skills/arguments.rs (main at bfe8ccd)"
---

What the sources say about [Skill arguments](/subjects/skills/arguments.md) in [Goose](/harnesses/goose.md).
How text typed after a skill invocation reaches the skill.

## Observations

- 2026-11-04: placeholders: $ARGUMENTS, $ARGUMENTS[N], $N, $name (declared argument names).[^goose-src-arguments]

  > \$ARGUMENTS\[(?P<idx>\d+)\]|\$ARGUMENTS\b|\$(?P<pos>\d+)
- 2026-11-04: no placeholder: text "ARGUMENTS: <args>" appended after the skill content.[^goose-src-arguments]

  > return Ok(format!("{content}\n\nARGUMENTS: {raw_args}"));

[^goose-src-arguments]: goose source: skills/arguments.rs (main at bfe8ccd)
