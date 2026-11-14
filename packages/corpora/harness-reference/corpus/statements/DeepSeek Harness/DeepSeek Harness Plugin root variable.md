---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: skills/plugin-root-variable
  object:
    variable: "${CLAUDE_PLUGIN_ROOT}"
    resolves_to: the pluginRoot config value of the hooks-claude-code row
    substituted_in:
      - hook command strings run by the experimental hooks-claude-code bridge
    context: "the bridge row in the profile composition; ${CLAUDE_PROJECT_DIR} is replaced the same way from projectDir"
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 dsh hooks bridge substitution](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20hooks%20bridge%20substitution.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "substituteCommand replaces ${CLAUDE_PLUGIN_ROOT} in a command string with the configured pluginRoot."
  - hasEvidenceItems:
      - "[2026-11-14 dsh hooks bridge pluginRoot field](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20hooks%20bridge%20pluginRoot%20field.md)"
      - "[2026-11-14 dsh hooks bridge command strings](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20hooks%20bridge%20command%20strings.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "The bridge README documents the pluginRoot field."
reportedIn:
  - "[deepseek-ai deepseek-harness hooks-claude-code config.ts at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20hooks-claude-code%20config.ts%20at%2039163dd.md)"
  - "[deepseek-ai deepseek-harness hooks-claude-code README at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20hooks-claude-code%20README%20at%2039163dd.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[Plugin root variable](../../subjects/skills/Plugin%20root%20variable.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

This is the only plugin-folder variable found. No source read shows a variable substituted in a skill body.
