---
type: Harness Fact
title: "DeepSeek Harness (dsh): Relative paths in SKILL.md"
description: "Relative paths in SKILL.md in DeepSeek Harness (dsh), as observed over time."
tags: [skills]
harness: dsh
subject: skills/relative-paths
observations:
  - value: {"resolves_from": "the skill base directory", "tells_model": true, "line": "Base directory for this skill: <path>"}
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

What the sources say about [Relative paths in SKILL.md](/subjects/skills/relative-paths.md) in [DeepSeek Harness (dsh)](/harnesses/dsh.md).
What folder a relative path in SKILL.md resolves from, whether the harness tells the model that folder, and whether the model follows it.

## Observations

- 2026-11-04: resolves from: the skill base directory; tells model: yes; line: Base directory for this skill: <path>.[^dsh-tool-skill]

  > Resolve relative paths mentioned by this skill against the base directory before using them.

[^dsh-tool-skill]: dsh tool-skill package README
