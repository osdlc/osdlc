---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: plugins/manifest-fields
  object:
    file: plugin.json
    also_read:
      - .goose-plugin/plugin.json
      - .plugin/plugin.json
    fields:
      - name: name
        type: string
        required: false
        use: plugin id and install directory; namespaces skills as name:skill; 1-64 lowercase letters, digits, dashes or periods
        note: When empty or absent, goose infers the name from the source URL or the directory.
      - name: version
        type: string
        required: false
        use: shown on install; unknown when absent
      - name: skills
        type: string | string[] | object
        required: false
        use: skill directories; an object takes paths and exclusive (true replaces the default skills directory)
      - name: mcpServers
        type: string | string[] | object
        required: false
        use: MCP config file paths (default .mcp.json), or an inline object with an mcpServers key
    not_in_manifest: hooks come from hooks/hooks.json, not a manifest key
    gemini_file: gemini-extension.json
    gemini_fields:
      - name: name
        type: string
        required: true
        use: plugin id
      - name: version
        type: string
        required: true
        use: plugin version
    docs_fields:
      - name
      - version
      - description
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-05 goose Plugin manifest fields](../../study-results/goose/2026-11-05%20goose%20Plugin%20manifest%20fields.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-05.
  - hasEvidenceItems:
      - "[2026-11-05 goose Plugin manifest fields 2](../../study-results/goose/2026-11-05%20goose%20Plugin%20manifest%20fields%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-05.
reportedIn:
  - "[block goose plugin format source at 4facf56](../../documents/github.com/block%20goose%20plugin%20format%20source%20at%204facf56.md)"
  - "[goose docs source Plugins at 4facf56](../../documents/github.com/goose%20docs%20source%20Plugins%20at%204facf56.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Plugin manifest fields](../../subjects/plugins/Plugin%20manifest%20fields.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Do the skills and mcpServers path rules (each path must start with ./ and stay inside the plugin) appear in any goose doc? Only the code states them.
imported_from: fact:plugins/manifest-fields@goose#scope-[null,null,null]
---

Imported from `facts/goose/plugins/manifest-fields.md`.

Open questions:
- Do the skills and mcpServers path rules (each path must start with ./ and stay inside the plugin) appear in any goose doc? Only the code states them.
