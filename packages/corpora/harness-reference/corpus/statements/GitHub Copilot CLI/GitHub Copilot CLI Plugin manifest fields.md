---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: plugins/manifest-fields
  object:
    file: plugin.json
    fields:
      - name: $schema
        type: string
        required: true
        use: must be the Agent Plugins 1.0.0 or 1.1.0 schema URL; opts the plugin into Agent Plugins semantics; an unsupported version is rejected
      - name: name
        type: string
        required: true
        use: plugin name; 1-64 lowercase letters, digits, hyphens and periods, no -- or ..
      - name: version
        type: string
        required: false
        use: version string; semver recommended
      - name: description
        type: string
        required: false
        use: brief description
      - name: author
        type: object
        required: false
        use: optional name, email and url strings
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
        use: plugin homepage or documentation
      - name: repository
        type: string
        required: false
        use: source repository
      - name: license
        type: string
        required: false
        use: license identifier; SPDX recommended
      - name: keywords
        type: string[]
        required: false
        use: search and discovery keywords
      - name: extensions
        type: object
        required: false
        use: client-specific data keyed by reverse-domain namespace
    legacy_files:
      - .plugin/plugin.json
      - plugin.json
      - .github/plugin/plugin.json
      - .claude-plugin/plugin.json
    legacy_fields:
      - name: name
        type: string
        required: true
        use: kebab-case plugin name, letters, numbers and hyphens; at most 64 characters
      - name: description
        type: string
        required: false
        use: brief description; at most 1024 characters
      - name: version
        type: string
        required: false
        use: semantic version
      - name: author
        type: object
        required: false
        use: author details
      - name: author.name
        required: conditional
        use: not documented
        note: Required when author is set.
      - name: author.email
        required: false
        use: not documented
      - name: author.url
        required: false
        use: not documented
      - name: homepage
        type: string
        required: false
        use: plugin homepage URL
      - name: repository
        type: string
        required: false
        use: source repository URL
      - name: license
        type: string
        required: false
        use: license identifier
      - name: keywords
        type: string[]
        required: false
        use: search keywords
      - name: category
        type: string
        required: false
        use: plugin category
      - name: tags
        type: string[]
        required: false
        use: additional tags
      - name: agents
        type: string | string[]
        required: false
        use: agent directories (.agent.md files); default agents
      - name: skills
        type: string | string[]
        required: false
        use: skill directories; default skills
      - name: commands
        type: string | string[]
        required: false
        use: command directories
      - name: hooks
        type: string | object
        required: false
        use: hooks config file, or an inline hooks object
      - name: extensions
        type: string | string[] | object
        required: false
        use: "extension directories; { paths, exclusive: true } suppresses built-in extensions"
      - name: mcpServers
        type: string | object
        required: false
        use: MCP config file, or inline server definitions
      - name: lspServers
        type: string | object
        required: false
        use: LSP config file, or inline server definitions
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-05 GitHub Copilot CLI Plugin manifest fields](../../study-results/GitHub%20Copilot%20CLI/2026-11-05%20GitHub%20Copilot%20CLI%20Plugin%20manifest%20fields.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-05.
  - hasEvidenceItems:
      - "[2026-11-05 GitHub Copilot CLI Plugin manifest fields 2](../../study-results/GitHub%20Copilot%20CLI/2026-11-05%20GitHub%20Copilot%20CLI%20Plugin%20manifest%20fields%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-05.
reportedIn:
  - "[GitHub Docs GitHub Copilot CLI plugin reference](../../documents/github.com/GitHub%20Docs%20GitHub%20Copilot%20CLI%20plugin%20reference.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[Plugin manifest fields](../../subjects/plugins/Plugin%20manifest%20fields.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:plugins/manifest-fields@copilot-cli#scope-[null,null,null]
---

Imported from `facts/copilot-cli/plugins/manifest-fields.md`.
