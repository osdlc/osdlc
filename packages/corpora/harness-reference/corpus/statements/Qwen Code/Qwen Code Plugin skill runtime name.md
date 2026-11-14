---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: skills/plugin-namespace
  object:
    runtime_name: acme-tools:review
    namespace_from: extension manifest `name`
    bare_alias: none; the bare name is not an alias
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Extension skill name source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Extension%20skill%20name%20source.md)"
      - "[2026-11-14 Qwen Code qualifySkillName source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20qualifySkillName%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at v0.27.3: the registry name is the extension name, a colon and the authored name"
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Extension skill naming docs](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Extension%20skill%20naming%20docs.md)"
      - "[2026-11-14 Qwen Code Extension skill bare name docs](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Extension%20skill%20bare%20name%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs at v0.27.3
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[Plugin skill runtime name](../../subjects/skills/Plugin%20skill%20runtime%20name.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

A skill from an extension is registered as `<extensionName>:<name>`. The bare name does not invoke it.
