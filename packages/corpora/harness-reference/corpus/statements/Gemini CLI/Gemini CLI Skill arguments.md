---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: skills/arguments
  object:
    supported: true
    invocation: /<skill-name> <text>
    mechanism: the text after the command is sent as the prompt once activate_skill has run; the skill body gets no placeholder substitution
    fallback: with no text, the prompt is `Use the skill <name>`
    note: interactive sessions only
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI skill slash command source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20skill%20slash%20command%20source.md)"
      - "[2026-11-14 Gemini CLI skill activation output source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20skill%20activation%20output%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at 0.68.0: the skill slash command passes its arguments on as the prompt; the activation output inserts the body unchanged."
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI headless slash command loaders source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20headless%20slash%20command%20loaders%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at 0.68.0: the headless command list does not include the skill loader."
reportedIn:
  - "[google-gemini gemini-cli cli src services SkillCommandLoader.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20cli%20src%20services%20SkillCommandLoader.ts%20at%205a5c718.md)"
  - "[google-gemini gemini-cli core src tools activate-skill.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20core%20src%20tools%20activate-skill.ts%20at%205a5c718.md)"
  - "[google-gemini gemini-cli cli src nonInteractiveCliCommands.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20cli%20src%20nonInteractiveCliCommands.ts%20at%205a5c718.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Skill arguments](../../subjects/skills/Skill%20arguments.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[Gemini CLI Skill arguments open](Gemini%20CLI%20Skill%20arguments%20open.md)"
---

Text typed after `/skill-name` does not go into the skill. The skill is activated, and the text is then sent as the next prompt.
