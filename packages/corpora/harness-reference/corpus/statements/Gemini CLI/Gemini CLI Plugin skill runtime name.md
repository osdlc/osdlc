---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: skills/plugin-namespace
  object:
    runtime_name: review
    namespace: none on the name the model sees; the slash command is /acme-tools:review
    namespace_from: gemini-extension.json `name`
    bare_alias: no; an extension skill's slash command always takes the prefix
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI extension skills loading source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20extension%20skills%20loading%20source.md)"
      - "[2026-11-14 Gemini CLI extension skill command prefix source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20extension%20skill%20command%20prefix%20source.md)"
      - "[2026-11-14 Gemini CLI slash command prefix separator source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20slash%20command%20prefix%20separator%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at 0.68.0: an extension skill keeps its frontmatter name and records the extension name; its slash command is always renamed to <extension>:<name>."
reportedIn:
  - "[google-gemini gemini-cli cli src config extension-manager.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20cli%20src%20config%20extension-manager.ts%20at%205a5c718.md)"
  - "[google-gemini gemini-cli cli src services SlashCommandResolver.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20cli%20src%20services%20SlashCommandResolver.ts%20at%205a5c718.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Plugin skill runtime name](../../subjects/skills/Plugin%20skill%20runtime%20name.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The model sees an extension skill under its frontmatter name, `review`, and activates it by that name. The slash command a user types is `/acme-tools:review`.
