---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: skills/prequalified-name
  object:
    behaviour: the colon in the name becomes a hyphen on load; the slash command then takes the extension prefix as usual
    example: /acme-tools:acme-tools-review
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI skill name sanitizing source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20skill%20name%20sanitizing%20source.md)"
      - "[2026-11-14 Gemini CLI extension skill command prefix source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20extension%20skill%20command%20prefix%20source.md)"
      - "[2026-11-14 Gemini CLI slash command prefix separator source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20slash%20command%20prefix%20separator%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at 0.68.0: a colon in a skill name is replaced with a hyphen, and an extension skill command is prefixed with the extension name."
reportedIn:
  - "[google-gemini gemini-cli core src skills skillLoader.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20core%20src%20skills%20skillLoader.ts%20at%205a5c718.md)"
  - "[google-gemini gemini-cli cli src services SlashCommandResolver.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20cli%20src%20services%20SlashCommandResolver.ts%20at%205a5c718.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Pre-qualified skill name](../../subjects/skills/Pre-qualified%20skill%20name.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

A frontmatter name `acme-tools:review` is loaded as `acme-tools-review`. The example follows from the two rules in the source; it was not run.
