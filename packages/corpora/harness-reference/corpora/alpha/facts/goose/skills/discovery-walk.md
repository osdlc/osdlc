---
type: Harness Fact
title: "Goose: Skill discovery walk"
description: "Skill discovery walk in Goose, as observed over time."
tags: [skills]
harness: goose
subject: skills/discovery-walk
observations:
  - value: {"recursive": true, "symlinks": "file and directory symlinks followed, including targets outside the root", "cycles": "prevented by canonical directory identity"}
    since: null
    until: null
    observed: "2026-11-04"
    source: goose-src-discovery
    locator: "crates/goose-agent/src/skills/discovery.rs:226-228 at bfe8ccd"
    evidence: source
open:
  - question: "Are skill folders in parent directories of the working directory searched? The source builds project roots from the working directory only."
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

What the sources say about [Skill discovery walk](/subjects/skills/discovery-walk.md) in [Goose](/harnesses/goose.md).
How skill folders are found: parent directories of the working directory, nested directories in a monorepo, and symlinked folders.

## Observations

- 2026-11-04: recursive: yes; symlinks: file and directory symlinks followed, including targets outside the root; cycles: prevented by canonical directory identity.[^goose-src-discovery]

  > Traversal follows file and directory symlinks, including targets outside a root. Canonical directory identities prevent cycles.

## Open questions

- Are skill folders in parent directories of the working directory searched? The source builds project roots from the working directory only.[^goose-skills]

[^goose-src-discovery]: goose source: skills/discovery.rs (main at bfe8ccd)
[^goose-skills]: goose docs: Skills
