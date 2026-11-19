---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: plugins/manifest-validation
  object:
    unknown_fields: ignored in qwen-extension.json; warned and ignored in an Agent Plugins plugin.json; rejected inside the Agent Plugins author object
    invalid_fields: a missing name, a name with other characters, a bad settings envVar or malformed JSON fails the load; in an Agent Plugins manifest a wrong $schema, bad name, or wrong-typed version, description, homepage, repository, license, author or keywords fails the load
    marketplace_invalid_fields: strict true with no plugin.json, an unsupported source type, or a source that leaves the marketplace or repository root fails that plugin's install
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-05 Qwen Code Plugin manifest validation](../../study-results/Qwen%20Code/2026-11-05%20Qwen%20Code%20Plugin%20manifest%20validation.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-05.
  - hasEvidenceItems:
      - "[2026-11-05 Qwen Code Plugin manifest validation 2](../../study-results/Qwen%20Code/2026-11-05%20Qwen%20Code%20Plugin%20manifest%20validation%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-05.
reportedIn:
  - "[QwenLM qwen-code extension source at 1bac51b](../../documents/github.com/QwenLM%20qwen-code%20extension%20source%20at%201bac51b.md)"
  - "[QwenLM qwen-code claude-converter.ts at 1bac51b](../../documents/github.com/QwenLM%20qwen-code%20claude-converter.ts%20at%201bac51b.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[Plugin manifest validation](../../subjects/plugins/Plugin%20manifest%20validation.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Does Qwen Code ship a validate command or a published JSON Schema for qwen-extension.json? The extensions command folder has no validate command, and no schema was found.
imported_from: fact:plugins/manifest-validation@qwen-code#scope-[null,null,null]
---

Imported from `facts/qwen-code/plugins/manifest-validation.md`.

Open questions:
- Does Qwen Code ship a validate command or a published JSON Schema for qwen-extension.json? The extensions command folder has no validate command, and no schema was found.
