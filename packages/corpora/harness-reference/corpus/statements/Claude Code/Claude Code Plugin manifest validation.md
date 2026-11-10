---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: plugins/manifest-validation
  object:
    unknown_fields: ignored
    strict_objects: an unknown key inside a userConfig option, channels entry, lspServers config or monitors entry is an error; the plugin does not load
    invalid_fields: a type mismatch or a missing or escaping path fails validation; Claude Code reports the same problem when it loads the plugin
    validator: claude plugin validate <dir> (--strict turns warnings into failures)
    validator_warns_on: unknown top-level field, non-kebab-case name, missing version, description or author
    marketplace_unknown_fields: ignored
    marketplace_invalid_entry: each entry is validated on its own, so one invalid entry does not fail the marketplace
    marketplace_validator: claude plugin validate <marketplace root or marketplace.json>
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-05 Claude Code Plugin manifest validation](../../study-results/Claude%20Code/2026-11-05%20Claude%20Code%20Plugin%20manifest%20validation.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-05.
  - hasEvidenceItems:
      - "[2026-11-05 Claude Code Plugin manifest validation 2](../../study-results/Claude%20Code/2026-11-05%20Claude%20Code%20Plugin%20manifest%20validation%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-05.
reportedIn:
  - "[Claude Code docs Plugin manifest reference](../../documents/code.claude.com/Claude%20Code%20docs%20Plugin%20manifest%20reference.md)"
  - "[Claude Code docs Marketplace reference](../../documents/code.claude.com/Claude%20Code%20docs%20Marketplace%20reference.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Plugin manifest validation](../../subjects/plugins/Plugin%20manifest%20validation.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - The docs describe a $schema key for editor autocomplete but name no schema URL. Does Anthropic publish a JSON Schema for plugin.json or marketplace.json?
imported_from: fact:plugins/manifest-validation@claude-code#scope-[null,null,null]
---

Imported from `facts/claude-code/plugins/manifest-validation.md`.

Open questions:
- The docs describe a $schema key for editor autocomplete but name no schema URL. Does Anthropic publish a JSON Schema for plugin.json or marketplace.json?
