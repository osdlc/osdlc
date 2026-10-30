---
type: Harness Fact
title: "DeepSeek Harness (dsh): User skill directories"
description: "User skill directories in DeepSeek Harness (dsh), as observed over time."
tags: [skills]
harness: dsh
subject: skills/user-dirs
observations:
  - value: { dirs: ["~/.dsh/skills", "~/.agents/skills"], order: after the project roots }
    since: null
    until: null
    observed: "2026-10-08"
    source: notes-dsh
    locator: "deepseek-ai/deepseek-harness packages/skill/skill-filesystem/README.md:44-56 at 5badb150"
    checked_version: "0.2.1-alpha.1"
    evidence: source
sources:
  - id: notes-dsh
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harnesses-deepseek.md"
    title: "DeepSeek Harness (dsh): harness notes for a dispatcher"
---

What the sources say about [User skill directories](/subjects/skills/user-dirs.md) in
[DeepSeek Harness (dsh)](/harnesses/dsh.md). Directories in the home directory the harness loads
skills from.

## Observations

- 2026-10-08: dirs: `~/.dsh/skills`, `~/.agents/skills`; order: after the project roots.[^notes-dsh]

[^notes-dsh]: DeepSeek Harness (dsh): harness notes for a dispatcher
