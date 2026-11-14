---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: skill-frontmatter/unknown-keys
  object:
    behavior: ignored
    known_keys:
      - name
      - description
    invalid_name_or_no_frontmatter: with no frontmatter, or without a string name and a string description, the skill is skipped without a warning
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI skill frontmatter keys read source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20skill%20frontmatter%20keys%20read%20source.md)"
      - "[2026-11-14 Gemini CLI skill without valid frontmatter source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20skill%20without%20valid%20frontmatter%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at 0.68.0: only name and description are taken from the parsed frontmatter; a file that yields neither returns null."
reportedIn:
  - "[google-gemini gemini-cli core src skills skillLoader.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20core%20src%20skills%20skillLoader.ts%20at%205a5c718.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Unknown frontmatter keys](../../subjects/skill-frontmatter/Unknown%20frontmatter%20keys.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Any key other than `name` and `description` is dropped after parsing, with no warning and no error.
