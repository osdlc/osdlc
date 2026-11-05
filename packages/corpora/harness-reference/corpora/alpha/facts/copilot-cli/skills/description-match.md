---
type: Harness Fact
title: "Copilot CLI: Skill picked from its description"
description: "Skill picked from its description in Copilot CLI, as observed over time."
tags: [skills]
harness: copilot-cli
subject: skills/description-match
observations:
  - value: {"model_picks_from_description": true}
    since: null
    until: null
    observed: "2026-11-04"
    source: copilot-cli-add-skills
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
  - value: {"advice": "description says what the skill does and when Copilot should use it"}
    since: null
    until: null
    observed: "2026-11-04"
    source: copilot-cli-add-skills
    locator: "Frontmatter description field"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
sources:
  - id: copilot-cli-add-skills
    resource: "https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills"
    title: "Copilot docs: add skills to Copilot CLI"
---

What the sources say about [Skill picked from its description](/subjects/skills/description-match.md) in [Copilot CLI](/harnesses/copilot-cli.md).
Whether the model picks a skill from its description alone when the user does not name it.

## Observations

- 2026-11-04: model picks from description: yes. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^copilot-cli-add-skills]

  > Copilot will decide when to use your skills based on your prompt and the skill's description.
- 2026-11-04: advice: description says what the skill does and when Copilot should use it. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^copilot-cli-add-skills]

  > A description of what the skill does, and when Copilot should use it.

[^copilot-cli-add-skills]: Copilot docs: add skills to Copilot CLI
