---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: cli/effort
  object:
    supported: true
    argv:
      - --reasoning-effort
      - "{level}"
    config_key: models.default_reasoning_effort
    levels:
      - none
      - minimal
      - low
      - medium
      - high
      - xhigh
      - max
    note: --effort is an alias. A model only accepts the levels its menu advertises; per-model menu option ids are accepted too. Works in the TUI and headless.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok cli effort flag](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20effort%20flag.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "The argument definition: --reasoning-effort with the visible alias effort."
  - hasEvidenceItems:
      - "[2026-11-14 grok effort row](../../study-results/Grok%20Build/2026-11-14%20grok%20effort%20row.md)"
      - "[2026-11-14 grok default reasoning effort key](../../study-results/Grok%20Build/2026-11-14%20grok%20default%20reasoning%20effort%20key.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The headless guide lists the canonical levels; the config reference lists the default key.
reportedIn:
  - "[xai-org grok-build pager cli.rs](../../documents/github.com/xai-org%20grok-build%20pager%20cli.rs.md)"
  - "[Grok Build user guide Headless mode](../../documents/github.com/Grok%20Build%20user%20guide%20Headless%20mode.md)"
  - "[Grok Build user guide Config reference](../../documents/github.com/Grok%20Build%20user%20guide%20Config%20reference.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Effort level flag](../../subjects/cli/Effort%20level%20flag.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The flag comes from the source. The level list and the config key come from the docs.
