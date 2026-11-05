---
type: Harness Fact
title: "Goose: Duplicate skill names"
description: "Duplicate skill names in Goose, as observed over time."
tags: [skills]
harness: goose
subject: skills/duplicate-names
observations:
  - value: {"winner": "first successfully parsed entry in root order; names compared case-sensitively", "within_root": "winner unspecified"}
    since: null
    until: null
    observed: "2026-11-04"
    source: goose-src-discovery
    locator: "crates/goose-agent/src/skills/discovery.rs:217-221 at bfe8ccd"
    evidence: source
open:
  - question: "What is the root order across project, global, plugin and legacy directories in the shipped build?"
    observed: "2026-11-04"
    source: goose-skills
sources:
  - id: goose-src-discovery
    resource: "https://github.com/aaif-goose/goose/blob/bfe8ccd23de1d2c47a4cb2970d522f093ae7f2ba/crates/goose-agent/src/skills/discovery.rs"
    title: "goose source: skills/discovery.rs (main at bfe8ccd)"
  - id: goose-skills
    resource: "https://goose-docs.ai/docs/guides/context-engineering/using-skills"
    title: "goose docs: Skills"
---

What the sources say about [Duplicate skill names](/subjects/skills/duplicate-names.md) in [Goose](/harnesses/goose.md).
What happens when two skills share a name, within one scope or across scopes (project, user, plugin, `.agents/`, `.claude/`): one shadows the other, both are shown, or an error.

## Observations

- 2026-11-04: winner: first successfully parsed entry in root order; names compared case-sensitively; within root: winner unspecified.[^goose-src-discovery]

  > Roots are visited in input order. The first successfully parsed entry with a given name wins; names are compared exactly and case-sensitively.

## Open questions

- What is the root order across project, global, plugin and legacy directories in the shipped build?[^goose-skills]

[^goose-src-discovery]: goose source: skills/discovery.rs (main at bfe8ccd)
[^goose-skills]: goose docs: Skills
