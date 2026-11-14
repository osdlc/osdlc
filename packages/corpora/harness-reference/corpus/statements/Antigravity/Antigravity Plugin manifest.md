---
proposition:
  subject: "[Antigravity](../../harnesses/Antigravity.md)"
  predicate: plugins/manifest
  object:
    file: plugin.json
    files:
      - plugin.json
      - .antigravity-plugin/plugin.json
      - .gemini-plugin/plugin.json
    optional: false
    required_fields: name, for agy plugin install and the Marketplace; a local folder without one takes the folder name
    schema: https://antigravity.google/schemas/v1/plugin.json
    skills_layout: skills/<name>/SKILL.md
    skills: the `skills` field lists extra skill directories beside the default skills folder
    mcp: mcp_config.json at the plugin root
    note: .antigravity-plugin/plugin.json takes precedence over a root plugin.json
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 build-plugins manifest required](../../study-results/Antigravity/2026-11-14%20build-plugins%20manifest%20required.md)"
      - "[2026-11-14 build-plugins manifest location](../../study-results/Antigravity/2026-11-14%20build-plugins%20manifest%20location.md)"
      - "[2026-11-14 build-plugins manifest name](../../study-results/Antigravity/2026-11-14%20build-plugins%20manifest%20name.md)"
      - "[2026-11-14 build-plugins manifest skills field](../../study-results/Antigravity/2026-11-14%20build-plugins%20manifest%20skills%20field.md)"
      - "[2026-11-14 build-plugins mcp file](../../study-results/Antigravity/2026-11-14%20build-plugins%20mcp%20file.md)"
      - "[2026-11-14 build-plugins skill name field](../../study-results/Antigravity/2026-11-14%20build-plugins%20skill%20name%20field.md)"
      - "[2026-11-14 discovery plugin manifest folders](../../study-results/Antigravity/2026-11-14%20discovery%20plugin%20manifest%20folders.md)"
      - "[2026-11-14 plugins schema url](../../study-results/Antigravity/2026-11-14%20plugins%20schema%20url.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The Build plugins, Plugins and Customization discovery pages describe the manifest.
reportedIn:
  - "[Antigravity docs Build plugins antigravity.google](../../documents/antigravity.google/Antigravity%20docs%20Build%20plugins%20antigravity.google.md)"
  - "[Antigravity docs Customization discovery](../../documents/antigravity.google/Antigravity%20docs%20Customization%20discovery.md)"
  - "[Antigravity docs Plugins antigravity.google](../../documents/antigravity.google/Antigravity%20docs%20Plugins%20antigravity.google.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Antigravity](../../harnesses/Antigravity.md)"
subject: "[Plugin manifest](../../subjects/plugins/Plugin%20manifest.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Every plugin needs a `plugin.json`, at the plugin root or in a `.antigravity-plugin/` or `.gemini-plugin/` subfolder. Component folders stay at the plugin root.
