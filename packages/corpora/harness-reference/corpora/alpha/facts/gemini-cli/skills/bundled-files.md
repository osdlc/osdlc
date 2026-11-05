---
type: Harness Fact
title: "Gemini CLI: Files beside SKILL.md"
description: "Files beside SKILL.md in Gemini CLI, as observed over time."
tags: [skills]
harness: gemini-cli
subject: skills/bundled-files
observations:
  - value: {"auto_loaded": false, "directory_access": "skill directory is added to allowed file paths on activation"}
    since: null
    until: null
    observed: "2026-11-04"
    source: gemini-cli-skills
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
sources:
  - id: gemini-cli-skills
    resource: "https://geminicli.com/docs/cli/skills/"
    title: "Gemini CLI docs: Agent Skills"
---

What the sources say about [Files beside SKILL.md](/subjects/skills/bundled-files.md) in [Gemini CLI](/harnesses/gemini-cli.md).
Whether files beside SKILL.md (scripts, references, assets) load into context without being asked for.

## Observations

- 2026-11-04: auto loaded: no; directory access: skill directory is added to allowed file paths on activation. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^gemini-cli-skills]

  > The skill's directory is added to the agent's allowed file paths, granting it permission to read any bundled assets.

[^gemini-cli-skills]: Gemini CLI docs: Agent Skills
