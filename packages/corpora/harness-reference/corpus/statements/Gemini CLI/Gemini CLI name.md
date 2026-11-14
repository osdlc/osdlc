---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: skill-frontmatter/name
  object:
    supported: true
    required: true
    note: 'must be a string; no length check; the characters : \ / < > * ? " | are each replaced with a hyphen'
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI skill frontmatter keys read source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20skill%20frontmatter%20keys%20read%20source.md)"
      - "[2026-11-14 Gemini CLI skill without valid frontmatter source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20skill%20without%20valid%20frontmatter%20source.md)"
      - "[2026-11-14 Gemini CLI skill name sanitizing source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20skill%20name%20sanitizing%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at 0.68.0: a skill loads only when name and description are both strings; the name is sanitized, not length-checked."
reportedIn:
  - "[google-gemini gemini-cli core src skills skillLoader.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20core%20src%20skills%20skillLoader.ts%20at%205a5c718.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[name](../../subjects/skill-frontmatter/name.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

A `SKILL.md` without a string `name` is not loaded. The loader checks no length, and replaces a few characters with hyphens.
