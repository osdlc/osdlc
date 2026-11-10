---
proposition:
  subject: "[Agent Plugins](../../harnesses/Agent%20Plugins.md)"
  predicate: plugins/manifest-fields
  object:
    file: plugin.json
    fields:
      - name: $schema
        type: string
        required: true
        use: canonical schema id; selects the client's local validation rules; an unsupported version rejects the plugin
      - name: name
        type: string
        required: true
        use: human-readable plugin name; 1-64 of a-z, 0-9, hyphen and period, alphanumeric at both ends, no -- or ..
      - name: version
        type: string
        required: false
        use: update checks and cache freshness; semver recommended, not enforced
      - name: description
        type: string
        required: false
        use: short description of plugin purpose
      - name: author
        type: object
        required: false
        use: may hold only name, email and url strings
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
        use: documentation or homepage URL
      - name: repository
        type: string
        required: false
        use: source repository URL
      - name: license
        type: string
        required: false
        use: license identifier; SPDX recommended
      - name: keywords
        type: string[]
        required: false
        use: search and discovery tags
      - name: extensions
        type: object
        required: false
        use: client-specific data keyed by reverse-domain namespace; each value an object
    schema_required:
      - $schema
      - name
    schema_closed: true
    schema_fields:
      - $schema
      - name
      - version
      - description
      - author
      - author.name
      - author.email
      - author.url
      - homepage
      - repository
      - license
      - keywords
      - extensions
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-05 Agent Plugins Plugin manifest fields](../../study-results/Agent%20Plugins/2026-11-05%20Agent%20Plugins%20Plugin%20manifest%20fields.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-05.
  - hasEvidenceItems:
      - "[2026-11-05 Agent Plugins Plugin manifest fields 2](../../study-results/Agent%20Plugins/2026-11-05%20Agent%20Plugins%20Plugin%20manifest%20fields%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-05.
reportedIn:
  - "[Agent Plugins Specification 1.0.0](../../documents/github.com/Agent%20Plugins%20Specification%201.0.0.md)"
  - "[Agent Plugins 1.0.0 plugin manifest schema](../../documents/github.com/Agent%20Plugins%201.0.0%20plugin%20manifest%20schema.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
harness: "[Agent Plugins](../../harnesses/Agent%20Plugins.md)"
subject: "[Plugin manifest fields](../../subjects/plugins/Plugin%20manifest%20fields.md)"
scope:
  since: 1.0.0
  until: null
  platform: []
  model: null
status: current
imported_from: fact:plugins/manifest-fields@agent-plugins#scope-["1.0.0",null,null]
---

Imported from `facts/agent-plugins/plugins/manifest-fields.md`.
