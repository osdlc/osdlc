---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: skills/name-source
  object:
    rule: frontmatter `name`; the directory name is not used
    required_fields:
      - name
      - description
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI skill frontmatter keys read source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20skill%20frontmatter%20keys%20read%20source.md)"
      - "[2026-11-14 Gemini CLI skill without valid frontmatter source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20skill%20without%20valid%20frontmatter%20source.md)"
      - "[2026-11-14 Gemini CLI skill name sanitizing source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20skill%20name%20sanitizing%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at 0.68.0: the skill name is the frontmatter name after sanitizing; a file without one is not loaded."
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI skill frontmatter fields docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20skill%20frontmatter%20fields%20docs.md)"
    directionOfEvidenceProvided: neutral
    description: "docs at 0.68.0: the name should match the directory name. The loader does not check it."
reportedIn:
  - "[google-gemini gemini-cli core src skills skillLoader.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20core%20src%20skills%20skillLoader.ts%20at%205a5c718.md)"
  - "[google-gemini gemini-cli docs cli creating-skills.md at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20docs%20cli%20creating-skills.md%20at%205a5c718.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Skill name source](../../subjects/skills/Skill%20name%20source.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The runtime name is the frontmatter `name`. The docs advise matching the directory name, but the loader never reads the directory name.
