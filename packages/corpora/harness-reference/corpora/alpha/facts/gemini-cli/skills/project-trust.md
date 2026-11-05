---
type: Harness Fact
title: "Gemini CLI: Project skills and folder trust"
description: "Project skills and folder trust in Gemini CLI, as observed over time."
tags: [skills]
harness: gemini-cli
subject: skills/project-trust
observations:
  - value: {"supported": true, "user_skills_affected": false}
    since: null
    until: null
    observed: "2026-11-04"
    source: gemini-cli-skills-tutorial
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
sources:
  - id: gemini-cli-skills-tutorial
    resource: "https://geminicli.com/docs/cli/tutorials/skills-getting-started/"
    title: "Gemini CLI docs: Getting started with skills"
---

What the sources say about [Project skills and folder trust](/subjects/skills/project-trust.md) in [Gemini CLI](/harnesses/gemini-cli.md).
Whether project skills load only after the user trusts the folder.

## Observations

- 2026-11-04: supported: yes; user skills affected: no. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^gemini-cli-skills-tutorial]

  > Skills under `<workspace>/.gemini/skills/` are only loaded when the workspace folder is marked as trusted.

[^gemini-cli-skills-tutorial]: Gemini CLI docs: Getting started with skills
