---
type: Harness Fact
title: "Antigravity CLI: Files beside SKILL.md"
description: "Files beside SKILL.md in Antigravity CLI, as observed over time."
tags: [skills]
harness: antigravity
subject: skills/bundled-files
observations:
  - value: {"layout": "optional scripts/, examples/, resources/ beside SKILL.md", "auto_loaded": "not stated"}
    since: null
    until: null
    observed: "2026-11-04"
    source: antigravity-skills
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Do files beside SKILL.md enter context without being requested?"
    observed: "2026-11-04"
    source: antigravity-skills
sources:
  - id: antigravity-skills
    resource: "https://antigravity.google/docs/skills"
    title: "Antigravity docs: Agent skills"
---

What the sources say about [Files beside SKILL.md](/subjects/skills/bundled-files.md) in [Antigravity CLI](/harnesses/antigravity.md).
Whether files beside SKILL.md (scripts, references, assets) load into context without being asked for.

## Observations

- 2026-11-04: layout: optional scripts/, examples/, resources/ beside SKILL.md; auto loaded: not stated. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^antigravity-skills]

  > Skills are organized as directory bundles containing a required `SKILL.md` file.

## Open questions

- Do files beside SKILL.md enter context without being requested?[^antigravity-skills]

[^antigravity-skills]: Antigravity docs: Agent skills
