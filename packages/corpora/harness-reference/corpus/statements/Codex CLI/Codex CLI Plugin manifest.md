---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: plugins/manifest
  object:
    documented: false
    files:
      - plugin.json (Agent Plugins root)
      - .codex-plugin/plugin.json (legacy)
    legacy_discovery_also:
      - .claude-plugin/plugin.json
      - .cursor-plugin/plugin.json
    skills: manifest-declared paths win, else `skills/`
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-08-08 Codex CLI Plugin manifest](../../study-results/Codex%20CLI/2026-08-08%20Codex%20CLI%20Plugin%20manifest.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: weak
    description: third-party observed 2026-08-08.
  - hasEvidenceItems:
      - "[2026-10-01 Codex CLI Plugin manifest](../../study-results/Codex%20CLI/2026-10-01%20Codex%20CLI%20Plugin%20manifest.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-10-01.
reportedIn:
  - "[Harness comparison](../../documents/skillwright/Harness%20comparison.md)"
  - "[Codex README](../../documents/OpenAI/Codex%20README.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-01T00:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Plugin manifest](../../subjects/plugins/Plugin%20manifest.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:plugins/manifest@codex#scope-[null,null,null]
---

Imported from `facts/codex/plugins/manifest.md`.
