---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: plugins/manifest-fields
  object:
    file: plugin.json
    files_checked:
      - plugin.json
      - .grok-plugin/plugin.json
      - .claude-plugin/plugin.json
    fields:
      - name: name
        type: string
        required: true
        use: plugin namespace; 1-64 lowercase letters, digits and hyphens, no leading or trailing hyphen
      - name: version
        type: string
        required: false
        use: semver version; grok plugin tag makes a release tag from it
      - name: description
        type: string
        required: false
        use: printed by grok plugin validate
      - name: author
        type: object
        required: false
        use: not documented
      - name: author.name
        type: string
        required: false
        use: not documented
      - name: author.email
        type: string
        required: false
        use: not documented
      - name: author.url
        type: string
        required: false
        use: not documented
      - name: homepage
        type: string
        required: false
        use: not documented
      - name: repository
        type: string
        required: false
        use: not documented
      - name: license
        type: string
        required: false
        use: not documented
      - name: keywords
        type: string[]
        required: false
        use: not documented
      - name: skills
        type: string | string[]
        required: false
        use: skill directories; replaces the default skills directory
      - name: commands
        type: string | string[]
        required: false
        use: command directories; replaces the default commands directory
      - name: agents
        type: string | string[]
        required: false
        use: agent directories; replaces the default agents directory
      - name: hooks
        type: string | object
        required: false
        use: hooks file path or inline hooks; default hooks/hooks.json
      - name: mcpServers
        type: string | object
        required: false
        use: MCP config path or inline servers; default .mcp.json
      - name: lspServers
        type: string | object
        required: false
        use: LSP config path or inline servers; default .lsp.json
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-05 Grok Build Plugin manifest fields](../../study-results/Grok%20Build/2026-11-05%20Grok%20Build%20Plugin%20manifest%20fields.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-05.
reportedIn:
  - "[xai-org grok-build plugins manifest.rs](../../documents/github.com/xai-org%20grok-build%20plugins%20manifest.rs.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Plugin manifest fields](../../subjects/plugins/Plugin%20manifest%20fields.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Does Grok Build show author, homepage, repository, license or keywords from plugin.json anywhere? The struct parses them but the code read does not use them.
imported_from: fact:plugins/manifest-fields@grok-build#scope-[null,null,null]
---

Imported from `facts/grok-build/plugins/manifest-fields.md`.

Open questions:
- Does Grok Build show author, homepage, repository, license or keywords from plugin.json anywhere? The struct parses them but the code read does not use them.
