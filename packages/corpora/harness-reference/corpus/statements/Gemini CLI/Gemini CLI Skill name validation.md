---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: skills/name-validation
  object:
    checks: 'none; the characters : \ / < > * ? " | are each replaced with a hyphen'
    blocking: false
    must_match_directory: false
    rejects_only: frontmatter without a string `name` and a string `description`
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI skill name sanitizing source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20skill%20name%20sanitizing%20source.md)"
      - "[2026-11-14 Gemini CLI skill frontmatter keys read source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20skill%20frontmatter%20keys%20read%20source.md)"
      - "[2026-11-14 Gemini CLI skill without valid frontmatter source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20skill%20without%20valid%20frontmatter%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at 0.68.0: the only handling of the name is a character replacement; the loader rejects only missing or non-string fields."
reportedIn:
  - "[google-gemini gemini-cli core src skills skillLoader.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20core%20src%20skills%20skillLoader.ts%20at%205a5c718.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Skill name validation](../../subjects/skills/Skill%20name%20validation.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The loader checks neither length nor character set. It replaces nine characters with hyphens and loads the skill.
