---
proposition:
  subject: "[Kiro](../../harnesses/Kiro.md)"
  predicate: plugins/manifest-fields
  object:
    file: plugin.json
    fields:
      - name: $schema
        required: true
        use: the Agent Plugins 1.0.0 schema URL
      - name: name
        required: true
        use: plugin id, kebab-case; Kiro uses it internally to identify the power
      - name: version
        required: true
        use: semantic version of the power
      - name: description
        required: true
        use: short description; replaces the catalog value in the Installed list
      - name: author
        type: object
        required: true
        use: author details; replaces the catalog value in the Installed list
      - name: author.name
        required: true
        use: not documented
      - name: author.email
        required: false
        use: not documented
      - name: author.url
        required: false
        use: not documented
      - name: keywords
        type: string[]
        required: true
        use: terms that activate the power when they appear in a prompt
      - name: homepage
        required: false
        use: not documented
      - name: repository
        required: false
        use: shown as a link only when HTTP or HTTPS; replaces the catalog value
      - name: license
        required: false
        use: not documented
    installed_metadata: in Kiro IDE 1.4.26 or later, a declared description, author, repository or keywords replaces the catalog value; an omitted field keeps it
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-05 Kiro Plugin manifest fields](../../study-results/Kiro/2026-11-05%20Kiro%20Plugin%20manifest%20fields.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-05.
  - hasEvidenceItems:
      - "[2026-11-05 Kiro Plugin manifest fields 2](../../study-results/Kiro/2026-11-05%20Kiro%20Plugin%20manifest%20fields%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-05.
reportedIn:
  - "[Kiro docs Create powers](../../documents/kiro.dev/Kiro%20docs%20Create%20powers.md)"
  - "[Kiro docs Install powers kiro.dev](../../documents/kiro.dev/Kiro%20docs%20Install%20powers%20kiro.dev.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
harness: "[Kiro](../../harnesses/Kiro.md)"
subject: "[Plugin manifest fields](../../subjects/plugins/Plugin%20manifest%20fields.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Kiro marks version, description, author and keywords required, which the Agent Plugins spec leaves optional. Does Kiro reject a plugin.json that omits them?
  - Does Kiro read the Agent Plugins extensions field?
  - Which front-matter fields does a legacy POWER.md take? The docs fetched do not list them.
imported_from: fact:plugins/manifest-fields@kiro#scope-[null,null,null]
---

Imported from `facts/kiro/plugins/manifest-fields.md`.

Open questions:
- Kiro marks version, description, author and keywords required, which the Agent Plugins spec leaves optional. Does Kiro reject a plugin.json that omits them?
- Does Kiro read the Agent Plugins extensions field?
- Which front-matter fields does a legacy POWER.md take? The docs fetched do not list them.
