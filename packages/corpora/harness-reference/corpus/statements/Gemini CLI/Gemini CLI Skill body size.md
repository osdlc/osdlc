---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: skills/body-size
  object:
    recommendation: SKILL.md body under 5k words
    remedy: move reference material, schemas and examples to files in a references/ directory
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI skill body size docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20skill%20body%20size%20docs.md)"
      - "[2026-11-14 Gemini CLI skill body remedy docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20skill%20body%20remedy%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs at 0.68.0: the best-practices page."
reportedIn:
  - "[google-gemini gemini-cli docs cli skills-best-practices.md at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20docs%20cli%20skills-best-practices.md%20at%205a5c718.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Skill body size](../../subjects/skills/Skill%20body%20size.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Is the body cut at some size when a skill is activated? The activation tool returns the whole body; a later cap on tool output was not checked.
---

The docs give a size to aim for and no hard limit.

Open questions:
- Is the body cut at some size when a skill is activated? The activation tool returns the whole body; a later cap on tool output was not checked.
