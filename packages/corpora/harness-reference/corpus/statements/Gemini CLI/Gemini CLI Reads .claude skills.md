---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: skills/claude-dir
  object:
    supported: false
    note: skills load from .gemini/skills and .agents/skills, ~/.gemini/skills and ~/.agents/skills, extensions and built-ins only
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI user skill roots source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20user%20skill%20roots%20source.md)"
      - "[2026-11-14 Gemini CLI workspace skill roots source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20workspace%20skill%20roots%20source.md)"
      - "[2026-11-14 Gemini CLI user skill directory paths source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20user%20skill%20directory%20paths%20source.md)"
      - "[2026-11-14 Gemini CLI workspace skill directory paths source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20workspace%20skill%20directory%20paths%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "source at 0.68.0: discoverSkills loads four directories besides built-in and extension skills; .claude/skills is not one of them (absence)."
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI skill discovery tiers docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20skill%20discovery%20tiers%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: weak
    description: "docs at 0.68.0: the discovery tiers do not name .claude/skills (absence)."
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
subject: "[Reads .claude skills](../../subjects/skills/Reads%20.claude%20skills.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

`discoverSkills` names every directory it loads, and `.claude/skills` is not among them.
