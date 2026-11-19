---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: plugins/manifest
  object:
    file: plugin.json
    format: an Agent Plugins manifest at the plugin root, or the legacy Copilot manifest
    files:
      - plugin.json (Agent Plugins, plugin root)
      - .plugin/plugin.json
      - plugin.json
      - .github/plugin/plugin.json
      - .claude-plugin/plugin.json
    skills_layout: skills/<name>/SKILL.md
    fallback: a legacy plugin with no skills directory falls back to a root SKILL.md
    optional: false
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 GitHub Copilot CLI Plugin manifest file docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Plugin%20manifest%20file%20docs.md)"
      - "[2026-11-14 GitHub Copilot CLI Plugin manifest locations docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Plugin%20manifest%20locations%20docs.md)"
      - "[2026-11-14 GitHub Copilot CLI Plugin skills location docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Plugin%20skills%20location%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The plugin reference names the manifest, its locations and the skills location.
reportedIn:
  - "[Copilot docs CLI plugin reference](../../documents/docs.github.com/Copilot%20docs%20CLI%20plugin%20reference.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[Plugin manifest](../../subjects/plugins/Plugin%20manifest.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Every plugin has a `plugin.json`. An Agent Plugins manifest sits at the plugin root. A legacy manifest is looked for in four places, in the order listed after the first entry of `files`.
