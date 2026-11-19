---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: plugins/manifest
  object:
    file: gemini-extension.json
    name: extension
    optional: false
    required_fields: name, version
    components: "found by directory: commands, hooks/hooks.json, skills, agents, policies"
    mcp: mcpServers in the manifest
    skills_layout: skills/<name>/SKILL.md
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI extension file names source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20extension%20file%20names%20source.md)"
      - "[2026-11-14 Gemini CLI extension manifest required fields source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20extension%20manifest%20required%20fields%20source.md)"
      - "[2026-11-05 Gemini CLI Plugin manifest fields](../../study-results/Gemini%20CLI/2026-11-05%20Gemini%20CLI%20Plugin%20manifest%20fields.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source: the manifest file name, the error for a manifest without name or version, and the fields and directories the loader reads."
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI extension manifest required docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20extension%20manifest%20required%20docs.md)"
      - "[2026-11-14 Gemini CLI extension skills directory docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20extension%20skills%20directory%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs at 0.68.0: every extension needs the manifest in its root; skills sit in skills/."
reportedIn:
  - "[google-gemini gemini-cli cli src config extensions variables.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20cli%20src%20config%20extensions%20variables.ts%20at%205a5c718.md)"
  - "[google-gemini gemini-cli cli src config extension-manager.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20cli%20src%20config%20extension-manager.ts%20at%205a5c718.md)"
  - "[google-gemini gemini-cli config source at 3fd7d26](../../documents/github.com/google-gemini%20gemini-cli%20config%20source%20at%203fd7d26.md)"
  - "[google-gemini gemini-cli docs extensions reference.md at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20docs%20extensions%20reference.md%20at%205a5c718.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Plugin manifest](../../subjects/plugins/Plugin%20manifest.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

A directory is an extension when its root holds `gemini-extension.json` with a `name` and a `version`. The fields are listed under Plugin manifest fields.
