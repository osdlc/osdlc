---
type: Harness Fact
title: "DeepSeek Harness (dsh): Files beside SKILL.md"
description: "Files beside SKILL.md in DeepSeek Harness (dsh), as observed over time."
tags: [skills]
harness: dsh
subject: skills/bundled-files
observations:
  - value: {"auto_loaded": false, "guidance": "the loaded text tells the model to load referenced resources only as needed"}
    since: null
    until: null
    observed: "2026-11-04"
    source: dsh-tool-skill
    locator: "packages/skill/tool-skill/README.md:203 at fcc0ad46"
    evidence: source
sources:
  - id: dsh-tool-skill
    resource: "https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/skill/tool-skill/README.md"
    title: "dsh tool-skill package README"
---

What the sources say about [Files beside SKILL.md](/subjects/skills/bundled-files.md) in [DeepSeek Harness (dsh)](/harnesses/dsh.md).
Whether files beside SKILL.md (scripts, references, assets) load into context without being asked for.

## Observations

- 2026-11-04: auto loaded: no; guidance: the loaded text tells the model to load referenced resources only as needed.[^dsh-tool-skill]

  > Resolve relative paths mentioned by this skill against the base directory before using them. Load referenced resources only as needed.

[^dsh-tool-skill]: dsh tool-skill package README
