---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: plugins/manifest-fields
  object:
    file: .cursor-plugin/plugin.json
    also_loads: plugin.json (Agent Plugins root manifest)
    fields:
      - name: name
        type: string
        required: true
        use: plugin id; lowercase kebab-case, alphanumerics, hyphens and periods
      - name: description
        type: string
        required: false
        use: brief plugin description
      - name: version
        type: string
        required: false
        use: semantic version
      - name: author
        type: object
        required: false
        use: author info
      - name: author.name
        required: conditional
        use: not documented
        note: Required when author is set.
      - name: author.email
        required: false
        use: not documented
      - name: homepage
        type: string
        required: false
        use: URL to the plugin homepage
      - name: repository
        type: string
        required: false
        use: URL to the plugin repository
      - name: license
        type: string
        required: false
        use: license identifier
      - name: keywords
        type: array
        required: false
        use: tags for discovery and categorization
      - name: logo
        type: string
        required: false
        use: logo path or absolute URL; relative paths resolve to raw.githubusercontent.com URLs
      - name: rules
        type: string | array
        required: false
        use: rule files or directories; replaces folder discovery
      - name: agents
        type: string | array
        required: false
        use: agent files or directories; replaces folder discovery
      - name: skills
        type: string | array
        required: false
        use: skill directories; replaces folder discovery
      - name: commands
        type: string | array
        required: false
        use: command files or directories; replaces folder discovery
      - name: hooks
        type: string | object
        required: false
        use: hooks config file, or inline hook config
      - name: mcpServers
        type: string | object | array
        required: false
        use: MCP config file, inline servers, or an array of either; overrides mcp.json discovery
      - name: variables
        type: object
        required: false
        use: JSON Schema naming variables users set in the dashboard; substituted into ${VAR} placeholders
    schema_file: .cursor-plugin/plugin.json
    schema_fields:
      - name: name
        type: string
        required: true
        use: plugin id in kebab-case
      - name: displayName
        type: string
        required: false
        use: human-readable display name
      - name: description
        type: string
        required: false
        use: short description
      - name: version
        type: string
        required: false
        use: semantic version
      - name: minClientVersions
        type: object
        required: false
        use: minimum client versions to install, keyed by client id; "never" hides the plugin from that client
      - name: minClientVersions.cursor
        type: string
        required: false
        use: minimum Cursor version, or never
      - name: minClientVersions.grokbot
        type: string
        required: false
        use: minimum Grok Bot version, or never
      - name: minClientVersions.sand
        type: string
        required: false
        use: deprecated id for Grok Bot
      - name: author
        type: object
        required: false
        use: the plugin author
      - name: author.name
        type: string
        required: conditional
        use: author name
        note: Required when author is set.
      - name: author.email
        type: string
        required: false
        use: author email address; format email
      - name: publisher
        type: string
        required: false
        use: publisher or organisation name
      - name: homepage
        type: string
        required: false
        use: homepage URL; format uri
      - name: repository
        type: string
        required: false
        use: source repository URL; format uri
      - name: license
        type: string
        required: false
        use: SPDX license identifier
      - name: logo
        type: string
        required: false
        use: logo path relative to the plugin root, or an absolute URL
      - name: keywords
        type: string[]
        required: false
        use: keywords for discovery and search
      - name: category
        type: string
        required: false
        use: category for marketplace classification
      - name: tags
        type: string[]
        required: false
        use: tags for filtering and discovery
      - name: commands
        type: string | string[]
        required: false
        use: globs or paths to command files
      - name: agents
        type: string | string[]
        required: false
        use: globs or paths to agent files
      - name: skills
        type: string | string[]
        required: false
        use: globs or paths to skill files
      - name: rules
        type: string | string[]
        required: false
        use: globs or paths to rule files
      - name: hooks
        type: string | object
        required: false
        use: hooks config file, or an inline hooks object
      - name: variables
        type: object
        required: false
        use: JSON Schema for user-configured plugin variables
      - name: variables.type
        type: string
        required: conditional
        use: must be object
        note: Required when variables is set.
      - name: variables.properties
        type: object
        required: false
        use: not documented
      - name: variables.required
        type: string[]
        required: false
        use: not documented
      - name: mcpServers
        type: string | object | (string | object)[]
        required: false
        use: MCP server config path, inline config, or an array of either
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-05 Cursor Plugin manifest fields](../../study-results/Cursor/2026-11-05%20Cursor%20Plugin%20manifest%20fields.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-05.
  - hasEvidenceItems:
      - "[2026-11-05 Cursor Plugin manifest fields 2](../../study-results/Cursor/2026-11-05%20Cursor%20Plugin%20manifest%20fields%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-05.
reportedIn:
  - "[Cursor docs Plugins reference](../../documents/cursor.com/Cursor%20docs%20Plugins%20reference.md)"
  - "[cursor plugins plugin.schema.json](../../documents/github.com/cursor%20plugins%20plugin.schema.json.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Plugin manifest fields](../../subjects/plugins/Plugin%20manifest%20fields.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - The docs omit displayName, minClientVersions, publisher, category and tags, which the cursor/plugins schema allows, and the schema omits nothing the docs list. Does the Cursor client read the schema-only fields?
imported_from: fact:plugins/manifest-fields@cursor#scope-[null,null,null]
---

Imported from `facts/cursor/plugins/manifest-fields.md`.

Open questions:
- The docs omit displayName, minClientVersions, publisher, category and tags, which the cursor/plugins schema allows, and the schema omits nothing the docs list. Does the Cursor client read the schema-only fields?
