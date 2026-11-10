---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: plugins/marketplace-fields
  object:
    file: .cursor-plugin/marketplace.json
    fields:
      - name: name
        type: string
        required: true
        use: marketplace id (kebab-case)
      - name: owner
        type: object
        required: true
        use: marketplace owner
      - name: owner.name
        required: true
        use: not documented
      - name: owner.email
        required: false
        use: not documented
      - name: plugins
        type: array
        required: true
        use: plugin entries; the whole file must be 10 MB or smaller
      - name: metadata
        type: object
        required: false
        use: marketplace metadata
      - name: metadata.description
        required: false
        use: not documented
      - name: metadata.version
        required: false
        use: not documented
      - name: metadata.pluginRoot
        required: false
        use: prefix path for all plugin sources
    entry_fields:
      - name: name
        type: string
        required: true
        use: plugin id (kebab-case)
      - name: source
        type: string | object
        required: false
        use: plugin directory, or an object with path and options
        note: The docs mark only name required in an entry.
      - name: description
        type: string
        required: false
        use: plugin description
      - name: version
        type: string
        required: false
        use: semantic version
      - name: author
        type: object
        required: false
        use: author info
      - name: homepage
        type: string
        required: false
        use: URL
      - name: repository
        type: string
        required: false
        use: URL
      - name: license
        type: string
        required: false
        use: license identifier
      - name: keywords
        type: array
        required: false
        use: search tags
      - name: logo
        type: string
        required: false
        use: relative path or URL to the logo
      - name: category
        type: string
        required: false
        use: plugin category
      - name: tags
        type: array
        required: false
        use: additional tags
      - name: skills
        type: string | array
        required: false
        use: component paths
      - name: rules
        type: string | array
        required: false
        use: component paths
      - name: agents
        type: string | array
        required: false
        use: component paths
      - name: commands
        type: string | array
        required: false
        use: component paths
      - name: hooks
        type: string | object
        required: false
        use: hooks config path or inline config
      - name: mcpServers
        type: string | object
        required: false
        use: MCP config path or inline config
      - name: variables
        type: object
        required: false
        use: JSON Schema of variable names; the plugin.json value wins when both are set
    schema_file: .cursor-plugin/marketplace.json
    schema_fields:
      - name: name
        type: string
        required: true
        use: marketplace id
      - name: owner
        type: object
        required: false
        use: marketplace owner or organisation
      - name: owner.name
        type: string
        required: conditional
        use: owner name
        note: Required when owner is set.
      - name: owner.email
        type: string
        required: false
        use: contact email; format email
      - name: metadata
        type: object
        required: false
        use: arbitrary metadata; extra keys allowed
      - name: metadata.description
        type: string
        required: false
        use: short marketplace description
      - name: plugins
        type: array
        required: true
        use: plugins in the marketplace
    schema_entry_fields:
      - name: name
        type: string
        required: true
        use: plugin id matching the name in its plugin.json
      - name: source
        type: string
        required: true
        use: plugin directory relative to the marketplace root, or a remote URL
      - name: description
        type: string
        required: false
        use: short plugin description
      - name: minClientVersions
        type: object
        required: false
        use: minimum client versions to install, keyed by client id
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-05 Cursor Marketplace fields](../../study-results/Cursor/2026-11-05%20Cursor%20Marketplace%20fields.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-05.
  - hasEvidenceItems:
      - "[2026-11-05 Cursor Marketplace fields 2](../../study-results/Cursor/2026-11-05%20Cursor%20Marketplace%20fields%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-05.
reportedIn:
  - "[Cursor docs Plugins reference](../../documents/cursor.com/Cursor%20docs%20Plugins%20reference.md)"
  - "[cursor plugins marketplace.schema.json](../../documents/github.com/cursor%20plugins%20marketplace.schema.json.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Marketplace fields](../../subjects/plugins/Marketplace%20fields.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - "Docs and the cursor/plugins schema disagree: the docs require owner, the schema does not; the docs list sixteen more entry fields, which the schema rejects; the schema requires source as a string, the docs allow an object. Which does the Cursor client follow?"
  - The docs say source may be an object with path and options but name no options. What source object forms does Cursor accept?
imported_from: fact:plugins/marketplace-fields@cursor#scope-[null,null,null]
---

Imported from `facts/cursor/plugins/marketplace-fields.md`.

Open questions:
- Docs and the cursor/plugins schema disagree: the docs require owner, the schema does not; the docs list sixteen more entry fields, which the schema rejects; the schema requires source as a string, the docs allow an object. Which does the Cursor client follow?
- The docs say source may be an object with path and options but name no options. What source object forms does Cursor accept?
