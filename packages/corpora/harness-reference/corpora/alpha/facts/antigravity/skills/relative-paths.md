---
type: Harness Fact
title: "Antigravity CLI: Relative paths in SKILL.md"
description: "Relative paths in SKILL.md in Antigravity CLI, as observed over time."
tags: [skills]
harness: antigravity
subject: skills/relative-paths
observations:
  - value: {"resolves_from": "the skill directory", "stated_for": "plugin skills"}
    since: null
    until: null
    observed: "2026-11-04"
    source: antigravity-build-plugins
    evidence: docs
    note: "Source is a summary of the build-plugins page; the activation text is not documented. Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Does the harness tell the model the skill folder when the body loads?"
    observed: "2026-11-04"
    source: antigravity-skills
sources:
  - id: antigravity-build-plugins
    resource: "https://antigravity.google/docs/build-plugins/"
    title: "Antigravity docs: Build plugins"
  - id: antigravity-skills
    resource: "https://antigravity.google/docs/skills"
    title: "Antigravity docs: Agent skills"
---

What the sources say about [Relative paths in SKILL.md](/subjects/skills/relative-paths.md) in [Antigravity CLI](/harnesses/antigravity.md).
What folder a relative path in SKILL.md resolves from, whether the harness tells the model that folder, and whether the model follows it.

## Observations

- 2026-11-04: resolves from: the skill directory; stated for: plugin skills. Source is a summary of the build-plugins page; the activation text is not documented. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^antigravity-build-plugins]

  > Inside `SKILL.md`, the docs say to reference bundled files with paths relative to the skill directory.

## Open questions

- Does the harness tell the model the skill folder when the body loads?[^antigravity-skills]

[^antigravity-build-plugins]: Antigravity docs: Build plugins
[^antigravity-skills]: Antigravity docs: Agent skills
