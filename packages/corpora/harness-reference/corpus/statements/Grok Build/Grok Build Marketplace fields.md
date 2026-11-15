---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: plugins/marketplace-fields
  object:
    file: .grok-plugin/marketplace.json
    files_checked:
      - .grok-plugin/marketplace.json
      - .grok-plugin/plugin.json
      - .claude-plugin/marketplace.json
      - .claude-plugin/plugin.json
    fields:
      - name: name
        type: string
        required: true
        use: marketplace display name
      - name: description
        type: string
        required: false
        use: not documented
      - name: owner
        type: object
        required: false
        use: not documented
      - name: owner.name
        type: string
        required: conditional
        use: not documented
        note: Required when owner is set.
      - name: owner.email
        type: string
        required: false
        use: not documented
      - name: plugins
        type: array
        required: false
        use: plugin entries; defaults to empty
    entry_fields:
      - name: name
        type: string
        required: true
        use: plugin name
      - name: version
        type: string
        required: false
        use: version from index metadata
      - name: description
        type: string
        required: false
        use: not documented
      - name: category
        type: string
        required: false
        use: category, such as development, productivity or design
      - name: author
        type: object
        required: false
        use: not documented
      - name: author.name
        type: string
        required: conditional
        use: not documented
        note: Required when author is set.
      - name: source
        type: string | object
        required: false
        use: plugin location; a plugin without one has no resolvable path
      - name: homepage
        type: string
        required: false
        use: not documented
      - name: tags
        type: string[]
        required: false
        use: not documented
      - name: keywords
        type: string[]
        required: false
        use: matcher keywords that tie the plugin to a user request
      - name: domains
        type: string[]
        required: false
        use: matcher domains that tie the plugin to a user request
    source_forms:
      - relative path (string)
      - local (type or source, path)
      - url (type or source, url, ref, sha, path)
    docs_entry_fields:
      - name
      - description
      - category
      - source
      - version
      - author
      - homepage
      - tags
      - keywords
    docs_top_level:
      - name
      - description
      - owner
      - plugins
    catalog_file: .grok-plugin/plugin-index.json
    catalog_fields:
      - name: version
        type: integer
        required: true
        use: catalog format version; only 1 is read
      - name: plugins
        type: object
        required: false
        use: map from index plugin name to its entry
      - name: plugins.<name>.sha
        type: string
        required: conditional
        use: commit the components came from
        note: Required for URL-sourced entries; must match the index sha or the components are hidden.
      - name: plugins.<name>.components
        type: object
        required: true
        use: skills, commands, hooks and agents shown in the browser before install
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-05 Grok Build Marketplace fields](../../study-results/Grok%20Build/2026-11-05%20Grok%20Build%20Marketplace%20fields.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-05.
  - hasEvidenceItems:
      - "[2026-11-05 Grok Build Marketplace fields 2](../../study-results/Grok%20Build/2026-11-05%20Grok%20Build%20Marketplace%20fields%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-05.
  - hasEvidenceItems:
      - "[2026-11-05 Grok Build Marketplace fields 3](../../study-results/Grok%20Build/2026-11-05%20Grok%20Build%20Marketplace%20fields%203.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-05.
reportedIn:
  - "[xai-org grok-build plugin-marketplace index.rs](../../documents/github.com/xai-org%20grok-build%20plugin-marketplace%20index.rs.md)"
  - "[Grok Build user guide Plugins](../../documents/github.com/Grok%20Build%20user%20guide%20Plugins.md)"
  - "[xai-org grok-build plugin-marketplace catalog.rs](../../documents/github.com/xai-org%20grok-build%20plugin-marketplace%20catalog.rs.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Marketplace fields](../../subjects/plugins/Marketplace%20fields.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:plugins/marketplace-fields@grok-build#scope-[null,null,null]
---

Imported from `facts/grok-build/plugins/marketplace-fields.md`.
