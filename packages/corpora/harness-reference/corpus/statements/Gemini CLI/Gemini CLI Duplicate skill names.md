---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: skills/duplicate-names
  object:
    behavior: higher-precedence location shadows lower
    order_low_to_high:
      - built-in
      - extension
      - user
      - workspace
    within_scope: .agents/skills alias takes precedence over .gemini/skills
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Gemini CLI Duplicate skill names](../../study-results/Gemini%20CLI/2026-11-04%20Gemini%20CLI%20Duplicate%20skill%20names.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Gemini CLI docs Agent Skills](../../documents/geminicli.com/Gemini%20CLI%20docs%20Agent%20Skills.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Duplicate skill names](../../subjects/skills/Duplicate%20skill%20names.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:skills/duplicate-names@gemini-cli#scope-[null,null,null]
---

Imported from `facts/gemini-cli/skills/duplicate-names.md`.
