---
type: Harness Fact
title: "Gemini CLI: Skill discovery walk"
description: "Skill discovery walk in Gemini CLI, as observed over time."
tags: [skills]
harness: gemini-cli
subject: skills/discovery-walk
observations: []
open:
  - question: "Does discovery walk parent directories of the working directory or nested directories in a monorepo, and are symlinked skill folders followed?"
    observed: "2026-11-04"
    source: gemini-cli-skills
sources:
  - id: gemini-cli-skills
    resource: "https://geminicli.com/docs/cli/skills/"
    title: "Gemini CLI docs: Agent Skills"
---

What the sources say about [Skill discovery walk](/subjects/skills/discovery-walk.md) in [Gemini CLI](/harnesses/gemini-cli.md).
How skill folders are found: parent directories of the working directory, nested directories in a monorepo, and symlinked folders.

## Open questions

- Does discovery walk parent directories of the working directory or nested directories in a monorepo, and are symlinked skill folders followed?[^gemini-cli-skills]

[^gemini-cli-skills]: Gemini CLI docs: Agent Skills
