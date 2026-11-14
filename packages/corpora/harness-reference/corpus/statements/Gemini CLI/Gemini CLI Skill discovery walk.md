---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: skills/discovery-walk
  object:
    locations:
      - built-in skills
      - extension skills
      - ~/.gemini/skills
      - ~/.agents/skills
      - .gemini/skills
      - .agents/skills
    depth: SKILL.md in the root itself or in an immediate child directory
    nested_subdirectories: false
    ancestor_dirs: not scanned; the two workspace roots sit under one directory
    exclusion: node_modules and .git are ignored
    inside_plugin: the skills directory of each active extension, scanned the same way
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI user skill roots source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20user%20skill%20roots%20source.md)"
      - "[2026-11-14 Gemini CLI workspace skill roots source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20workspace%20skill%20roots%20source.md)"
      - "[2026-11-14 Gemini CLI workspace skill directory paths source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20workspace%20skill%20directory%20paths%20source.md)"
      - "[2026-11-14 Gemini CLI skill file glob source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20skill%20file%20glob%20source.md)"
      - "[2026-11-14 Gemini CLI extension skills loading source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20extension%20skills%20loading%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at 0.68.0: the fixed list of roots and the glob used in each."
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI skill discovery tiers docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20skill%20discovery%20tiers%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs at 0.68.0: the discovery tiers."
reportedIn:
  - "[google-gemini gemini-cli core src skills skillManager.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20core%20src%20skills%20skillManager.ts%20at%205a5c718.md)"
  - "[google-gemini gemini-cli core src config storage.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20core%20src%20config%20storage.ts%20at%205a5c718.md)"
  - "[google-gemini gemini-cli core src skills skillLoader.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20core%20src%20skills%20skillLoader.ts%20at%205a5c718.md)"
  - "[google-gemini gemini-cli cli src config extension-manager.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20cli%20src%20config%20extension-manager.ts%20at%205a5c718.md)"
  - "[google-gemini gemini-cli docs cli skills.md at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20docs%20cli%20skills.md%20at%205a5c718.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Skill discovery walk](../../subjects/skills/Skill%20discovery%20walk.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Are symlinked skill folders followed? The loader sets no symlink option; no run was made.
---

Skills are loaded from a fixed list of roots; a later root wins on a name clash. In each root the glob is `SKILL.md` and `*/SKILL.md`, so a skill two levels down is not found. Nothing walks up to parent directories.

Open questions:
- Are symlinked skill folders followed? The loader sets no symlink option; no run was made.
