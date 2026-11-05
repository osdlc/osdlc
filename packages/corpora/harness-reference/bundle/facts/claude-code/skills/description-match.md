---
type: Harness Fact
title: "Claude Code: Skill picked from its description"
description: "Skill picked from its description in Claude Code, as observed over time."
tags: [skills]
harness: claude-code
subject: skills/description-match
observations:
  - value: {"model_picks_from_description": true, "advice": "put the key use case first; include keywords users would say"}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-skills
    locator: "Frontmatter reference, description"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
  - value: {"troubleshooting_advice": "check the description includes keywords users would naturally say"}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-skills
    locator: "Troubleshooting, Skill not triggering"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
  - value: {"malformed_yaml": "skill body loads with empty metadata so Claude cannot match the description; /skill-name still works"}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-skills
    locator: "Troubleshooting, Skill not triggering"
    evidence: docs
open:
  - question: "Do the docs give a measured reliability for description-only selection, or name a model it was tuned for?"
    observed: "2026-11-04"
    source: claude-code-skills
sources:
  - id: claude-code-skills
    resource: "https://code.claude.com/docs/en/skills"
    title: "Claude Code docs: skills"
---

What the sources say about [Skill picked from its description](/subjects/skills/description-match.md) in [Claude Code](/harnesses/claude-code.md).
Whether the model picks a skill from its description alone when the user does not name it.

## Observations

- 2026-11-04: model picks from description: yes; advice: put the key use case first; include keywords users would say. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^claude-code-skills]

  > Claude uses this to decide when to apply the skill. If omitted, uses the first non-empty line of the markdown content. Put the key use case first
- 2026-11-04: troubleshooting advice: check the description includes keywords users would naturally say. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^claude-code-skills]

  > Check the description includes keywords users would naturally say
- 2026-11-04: malformed yaml: skill body loads with empty metadata so Claude cannot match the description; /skill-name still works.[^claude-code-skills]

  > If the frontmatter YAML is malformed, Claude Code loads the skill body with empty metadata, so /skill-name still works but Claude can't match against your description.

## Open questions

- Do the docs give a measured reliability for description-only selection, or name a model it was tuned for?[^claude-code-skills]

[^claude-code-skills]: Claude Code docs: skills
