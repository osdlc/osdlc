---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: plugins/manifest
  object:
    file: plugin.json
    files:
      - plugin.json
      - .grok-plugin/plugin.json
      - .claude-plugin/plugin.json
    optional: true
    fallback: "the standard directories: skills/, commands/, agents/, hooks/hooks.json, .mcp.json, .lsp.json"
    skills_layout: skills/<name>/SKILL.md
    mcp: .mcp.json
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok plugin manifest search order](../../study-results/Grok%20Build/2026-11-14%20grok%20plugin%20manifest%20search%20order.md)"
      - "[2026-11-14 grok plugin manifest files](../../study-results/Grok%20Build/2026-11-14%20grok%20plugin%20manifest%20files.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The manifest search order.
  - hasEvidenceItems:
      - "[2026-11-14 grok plugin manifest optional](../../study-results/Grok%20Build/2026-11-14%20grok%20plugin%20manifest%20optional.md)"
      - "[2026-11-14 grok plugin contents](../../study-results/Grok%20Build/2026-11-14%20grok%20plugin%20contents.md)"
      - "[2026-11-14 grok plugin skill layout](../../study-results/Grok%20Build/2026-11-14%20grok%20plugin%20skill%20layout.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The plugins guide.
reportedIn:
  - "[xai-org grok-build plugins manifest.rs](../../documents/github.com/xai-org%20grok-build%20plugins%20manifest.rs.md)"
  - "[Grok Build user guide Plugins](../../documents/github.com/Grok%20Build%20user%20guide%20Plugins.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Plugin manifest](../../subjects/plugins/Plugin%20manifest.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
