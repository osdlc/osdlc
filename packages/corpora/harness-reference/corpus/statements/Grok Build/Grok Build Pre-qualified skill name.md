---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: skills/prequalified-name
  object:
    behaviour: "a colon is not a slug character, so the name is normalized: the colon becomes a hyphen"
    example: acme-tools-review
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok skill name normalize](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20name%20normalize.md)"
      - "[2026-11-14 grok skill name normalize 2](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20name%20normalize%202.md)"
      - "[2026-11-14 grok skill name valid](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20name%20valid.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The name normalizer maps every character outside a-z and 0-9 to a hyphen. The result for a prefixed name is read from that rule, not run, so the line is held one step below source.
reportedIn:
  - "[xai-org grok-build skills discovery.rs](../../documents/github.com/xai-org%20grok-build%20skills%20discovery.rs.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Pre-qualified skill name](../../subjects/skills/Pre-qualified%20skill%20name.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Derived from the normalizer in the source. No run was made.
