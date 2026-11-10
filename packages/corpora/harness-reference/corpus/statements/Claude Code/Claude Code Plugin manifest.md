---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: plugins/manifest
  object:
    file: .claude-plugin/plugin.json
    skills_layout: skills/<name>/SKILL.md
    optional: true
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-10-01 Claude Code Plugin manifest](../../study-results/Claude%20Code/2026-10-01%20Claude%20Code%20Plugin%20manifest.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-10-01.
  - hasEvidenceItems:
      - "[2026-11-09 docs pmanifest location](../../study-results/Claude%20Code/2026-11-09%20docs%20pmanifest%20location.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: weak
    description: "Partial: the manifest is .claude-plugin/plugin.json under the plugin root; the excerpt does not cover the skills layout or that it is optional."
reportedIn:
  - "[Claude Code docs plugins reference](../../documents/code.claude.com/Claude%20Code%20docs%20plugins%20reference.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-01T00:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T07:53:54Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Plugin manifest](../../subjects/plugins/Plugin%20manifest.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:plugins/manifest@claude-code#scope-[null,null,null]
---

Imported from `facts/claude-code/plugins/manifest.md`.
