---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: skills/plugin-namespace
  object:
    runtime_name: review; acme-tools:review when the bare name collides with another skill or a built-in command
    namespace: "<plugin name>:"
    namespace_from: the plugin name
    bare_alias: the bare name is the default; the qualified form is what Grok advertises on a collision
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok skill qualified name format](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20qualified%20name%20format.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The qualified name of a plugin skill is plugin-name:skill-name.
  - hasEvidenceItems:
      - "[2026-11-14 grok skill qualified names](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20qualified%20names.md)"
      - "[2026-11-14 grok skill collision](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20collision.md)"
      - "[2026-11-14 grok plugin skill does not override](../../study-results/Grok%20Build/2026-11-14%20grok%20plugin%20skill%20does%20not%20override.md)"
      - "[2026-11-14 grok plugin skill qualified form](../../study-results/Grok%20Build/2026-11-14%20grok%20plugin%20skill%20qualified%20form.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The skills and plugins guides.
reportedIn:
  - "[xai-org grok-build skills skill.rs](../../documents/github.com/xai-org%20grok-build%20skills%20skill.rs.md)"
  - "[Grok Build user guide Skills](../../documents/github.com/Grok%20Build%20user%20guide%20Skills.md)"
  - "[Grok Build user guide Plugins](../../documents/github.com/Grok%20Build%20user%20guide%20Plugins.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Plugin skill runtime name](../../subjects/skills/Plugin%20skill%20runtime%20name.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
