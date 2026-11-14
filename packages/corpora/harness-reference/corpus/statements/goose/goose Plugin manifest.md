---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: plugins/manifest
  object:
    name: plugin
    format: Open Plugins; Gemini extensions (gemini-extension.json) are also accepted
    files:
      - .goose-plugin/plugin.json
      - .plugin/plugin.json
      - plugin.json
    optional: true
    fallback: hooks/hooks.json, commands, agents or .mcp.json at the plugin root; the name is then inferred from the source or the directory
    skills_layout: skills/<name>/SKILL.md; a SKILL.md at the plugin root counts when there is no skills folder and no skills key
    documented: true
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose open plugins manifests](../../study-results/goose/2026-11-14%20goose%20open%20plugins%20manifests.md)"
      - "[2026-11-14 goose open plugins component markers](../../study-results/goose/2026-11-14%20goose%20open%20plugins%20component%20markers.md)"
      - "[2026-11-14 goose open plugins root skill](../../study-results/goose/2026-11-14%20goose%20open%20plugins%20root%20skill.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The manifest paths in lookup order, the markers that make a folder a plugin without one, and the root SKILL.md case.
  - hasEvidenceItems:
      - "[2026-11-14 goose docs plugin formats](../../study-results/goose/2026-11-14%20goose%20docs%20plugin%20formats.md)"
      - "[2026-11-14 goose docs plugin without manifest](../../study-results/goose/2026-11-14%20goose%20docs%20plugin%20without%20manifest.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The plugins guide lists the formats and the no-manifest case.
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
subject: "[Plugin manifest](../../subjects/plugins/Plugin%20manifest.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

An Open Plugins manifest is `plugin.json`, at the root or under `.plugin` or `.goose-plugin`. It is optional when the folder holds a known component.
