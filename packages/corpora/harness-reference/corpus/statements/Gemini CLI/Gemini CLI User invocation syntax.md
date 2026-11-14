---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: skills/user-invocation
  object:
    syntax: /review
    effect: runs activate_skill for the skill, then sends the rest of the line as the prompt
    note: interactive sessions only; an extension skill is /acme-tools:review; white space in a skill name becomes a hyphen
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI skill slash command source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20skill%20slash%20command%20source.md)"
      - "[2026-11-14 Gemini CLI skill slash command name source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20skill%20slash%20command%20name%20source.md)"
      - "[2026-11-14 Gemini CLI extension skill command prefix source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20extension%20skill%20command%20prefix%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at 0.68.0: each skill becomes a slash command named after it."
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI headless slash command loaders source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20headless%20slash%20command%20loaders%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at 0.68.0: the headless command list does not include the skill loader."
reportedIn:
  - "[google-gemini gemini-cli cli src services SkillCommandLoader.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20cli%20src%20services%20SkillCommandLoader.ts%20at%205a5c718.md)"
  - "[google-gemini gemini-cli cli src services SlashCommandResolver.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20cli%20src%20services%20SlashCommandResolver.ts%20at%205a5c718.md)"
  - "[google-gemini gemini-cli cli src nonInteractiveCliCommands.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20cli%20src%20nonInteractiveCliCommands.ts%20at%205a5c718.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[User invocation syntax](../../subjects/skills/User%20invocation%20syntax.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Each skill that is not built in is a slash command in the interactive UI.
