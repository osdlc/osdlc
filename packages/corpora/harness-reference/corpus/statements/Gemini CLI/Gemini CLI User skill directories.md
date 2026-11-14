---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: skills/user-dirs
  object:
    dirs:
      - ~/.gemini/skills
      - ~/.agents/skills
    order: below workspace skills, above extension skills; on a name clash ~/.agents/skills wins over ~/.gemini/skills
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI user skill roots source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20user%20skill%20roots%20source.md)"
      - "[2026-11-14 Gemini CLI user skill directory paths source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20user%20skill%20directory%20paths%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at 0.68.0: the two user roots and the order they load in."
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI skill discovery tiers docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20skill%20discovery%20tiers%20docs.md)"
      - "[2026-11-14 Gemini CLI skill alias precedence docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20skill%20alias%20precedence%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs at 0.68.0: the tiers and the alias precedence."
reportedIn:
  - "[google-gemini gemini-cli core src skills skillManager.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20core%20src%20skills%20skillManager.ts%20at%205a5c718.md)"
  - "[google-gemini gemini-cli core src config storage.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20core%20src%20config%20storage.ts%20at%205a5c718.md)"
  - "[google-gemini gemini-cli docs cli skills.md at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20docs%20cli%20skills.md%20at%205a5c718.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[User skill directories](../../subjects/skills/User%20skill%20directories.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

User skills load from `~/.gemini/skills`, then `~/.agents/skills`; the later one wins.
