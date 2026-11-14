---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: skill-frontmatter/compatibility
  object:
    supported: false
    note: the loader reads only `name` and `description` from the frontmatter
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI skill frontmatter keys read source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20skill%20frontmatter%20keys%20read%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "source at 0.68.0: parseFrontmatter returns only name and description, so no other key reaches the skill definition (absence)."
reportedIn:
  - "[google-gemini gemini-cli core src skills skillLoader.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20core%20src%20skills%20skillLoader.ts%20at%205a5c718.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[compatibility](../../subjects/skill-frontmatter/compatibility.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The skill loader takes `name` and `description` from the frontmatter and nothing else. A `compatibility` key parses as YAML and is then dropped.
