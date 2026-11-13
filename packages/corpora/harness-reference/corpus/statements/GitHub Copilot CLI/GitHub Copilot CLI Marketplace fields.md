---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: plugins/marketplace-fields
  object:
    file: .github/plugin/marketplace.json
    files_checked:
      - marketplace.json
      - .plugin/marketplace.json
      - .github/plugin/marketplace.json
      - .claude-plugin/marketplace.json
    fields:
      - name: name
        type: string
        required: true
        use: kebab-case marketplace name, at most 64 characters; becomes the registration key and the part after @ in a plugin id
      - name: owner
        type: object
        required: true
        use: marketplace owner info
      - name: owner.name
        required: true
        use: not documented
      - name: owner.email
        required: false
        use: not documented
      - name: plugins
        type: array
        required: true
        use: plugin entries
      - name: metadata
        type: object
        required: false
        use: not documented
      - name: metadata.description
        required: false
        use: not documented
      - name: metadata.version
        required: false
        use: not documented
      - name: metadata.pluginRoot
        required: false
        use: not documented
    entry_fields:
      - name: name
        type: string
        required: true
        use: kebab-case plugin name, at most 64 characters; dots allowed for Agent Plugins plugins
      - name: source
        type: string | object
        required: true
        use: where to fetch the plugin
      - name: description
        type: string
        required: false
        use: plugin description; at most 1024 characters
      - name: version
        type: string
        required: false
        use: plugin version
      - name: author
        type: object
        required: false
        use: "{ name, email?, url? }"
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
      - name: commands
        type: string | string[]
        required: false
        use: command directories
      - name: agents
        type: string | string[]
        required: false
        use: agent directories
      - name: skills
        type: string | string[]
        required: false
        use: skill directories
      - name: hooks
        type: string | object
        required: false
        use: hooks config path or inline hooks object
      - name: mcpServers
        type: string | object
        required: false
        use: MCP servers to activate on install, when the plugin ships no MCP config of its own
      - name: lspServers
        type: string | object
        required: false
        use: LSP config path or inline server definitions
      - name: strict
        type: boolean
        required: false
        use: default true, full schema and validation rules; false relaxes validation
    source_forms:
      - relative path (string; the leading dot-slash is optional)
      - github (repo, ref, sha, path)
      - url (ref, sha; other keys not documented)
    source_path_rule: a source path is relative to the repository root; plugins/x and the dot-slash spelling resolve to the same directory
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-05 GitHub Copilot CLI Marketplace fields](../../study-results/GitHub%20Copilot%20CLI/2026-11-05%20GitHub%20Copilot%20CLI%20Marketplace%20fields.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-05.
  - hasEvidenceItems:
      - "[2026-11-05 GitHub Copilot CLI Marketplace fields 2](../../study-results/GitHub%20Copilot%20CLI/2026-11-05%20GitHub%20Copilot%20CLI%20Marketplace%20fields%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-05.
reportedIn:
  - "[GitHub Docs GitHub Copilot CLI plugin reference](../../documents/github.com/GitHub%20Docs%20GitHub%20Copilot%20CLI%20plugin%20reference.md)"
  - "[GitHub Docs reusable path to plugins](../../documents/github.com/GitHub%20Docs%20reusable%20path%20to%20plugins.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[Marketplace fields](../../subjects/plugins/Marketplace%20fields.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - What keys does a url source object take besides sha and ref? The page names the url type and says it accepts sha, but shows only github objects and does not list the url key itself.
imported_from: fact:plugins/marketplace-fields@copilot-cli#scope-[null,null,null]
---

Imported from `facts/copilot-cli/plugins/marketplace-fields.md`.

Open questions:
- What keys does a url source object take besides sha and ref? The page names the url type and says it accepts sha, but shows only github objects and does not list the url key itself.
