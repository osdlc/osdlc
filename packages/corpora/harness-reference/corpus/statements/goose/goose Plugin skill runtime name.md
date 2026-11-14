---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: skills/plugin-namespace
  object:
    runtime_name: acme-tools:review
    namespace: "acme-tools:"
    namespace_from: the plugin manifest name, else a name inferred from the source or the directory; written into SKILL.md at install
    note: Open Plugins only. Skills of a Gemini extension keep their own name.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose open plugins namespaced name](../../study-results/goose/2026-11-14%20goose%20open%20plugins%20namespaced%20name.md)"
      - "[2026-11-14 goose open plugins rewrite skill name](../../study-results/goose/2026-11-14%20goose%20open%20plugins%20rewrite%20skill%20name.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: On install the skill name becomes plugin:skill and is written into the copied SKILL.md.
  - hasEvidenceItems:
      - "[2026-11-14 goose docs plugin skill namespace](../../study-results/goose/2026-11-14%20goose%20docs%20plugin%20skill%20namespace.md)"
      - "[2026-11-14 goose docs gemini skills not prefixed](../../study-results/goose/2026-11-14%20goose%20docs%20gemini%20skills%20not%20prefixed.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The plugins guide gives the namespaced name and the Gemini exception.
reportedIn:
  - "[aaif-goose goose open_plugins.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20open_plugins.rs%20at%202365bc5.md)"
  - "[aaif-goose goose plugins.md at 2365bc5](../../documents/github.com/aaif-goose%20goose%20plugins.md%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Plugin skill runtime name](../../subjects/skills/Plugin%20skill%20runtime%20name.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

An Open Plugins skill is installed as `<plugin>:<skill>`, so `review` in `acme-tools` becomes `acme-tools:review`.
