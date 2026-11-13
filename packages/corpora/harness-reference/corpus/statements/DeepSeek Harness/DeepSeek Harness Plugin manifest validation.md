---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: plugins/manifest-validation
  object:
    unknown_fields: ignored
    invalid_fields: a package.json that is not a JSON object, a dsh.bundle.patch that is not a string or list of strings fails the load; a platforms list that excludes the host skips the bundle; a package with no dsh.bundle installs with a warning as a plain dependency; dsh.manifestVersion and engines.dsh are not enforced
    reader_validation: each reader validates only the fields it uses; the shared package supplies no parser
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-05 DeepSeek Harness Plugin manifest validation](../../study-results/DeepSeek%20Harness/2026-11-05%20DeepSeek%20Harness%20Plugin%20manifest%20validation.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-05.
  - hasEvidenceItems:
      - "[2026-11-05 DeepSeek Harness Plugin manifest validation 2](../../study-results/DeepSeek%20Harness/2026-11-05%20DeepSeek%20Harness%20Plugin%20manifest%20validation%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-05.
reportedIn:
  - "[deepseek-ai deepseek-harness boot packages at fcc0ad4](../../documents/github.com/deepseek-ai%20deepseek-harness%20boot%20packages%20at%20fcc0ad4.md)"
  - "[deepseek-ai deepseek-harness package-manifest README at fcc0ad4](../../documents/github.com/deepseek-ai%20deepseek-harness%20package-manifest%20README%20at%20fcc0ad4.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[Plugin manifest validation](../../subjects/plugins/Plugin%20manifest%20validation.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Does dsh ship a validate command or a published JSON Schema for the dsh block? None was found; the types package says it has no parser.
imported_from: fact:plugins/manifest-validation@dsh#scope-[null,null,null]
---

Imported from `facts/dsh/plugins/manifest-validation.md`.

Open questions:
- Does dsh ship a validate command or a published JSON Schema for the dsh block? None was found; the types package says it has no parser.
