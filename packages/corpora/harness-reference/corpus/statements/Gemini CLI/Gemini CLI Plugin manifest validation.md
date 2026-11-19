---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: plugins/manifest-validation
  object:
    unknown_fields: ignored
    invalid_fields: a missing name or version, a name with characters other than letters, digits and dashes, or malformed JSON fails the load and the extension is not installed; other field types are not checked at load
    validator: gemini extensions validate <path>
    validator_checks: context files exist and stay inside the extension; version is semver (warning); mcpServers is an object and each server names a transport (command, url, httpUrl or tcp) and has a valid URL; httpUrl is deprecated (warning)
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-05 Gemini CLI Plugin manifest validation](../../study-results/Gemini%20CLI/2026-11-05%20Gemini%20CLI%20Plugin%20manifest%20validation.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-05.
reportedIn:
  - "[google-gemini gemini-cli CLI source at 3fd7d26](../../documents/github.com/google-gemini%20gemini-cli%20CLI%20source%20at%203fd7d26.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Plugin manifest validation](../../subjects/plugins/Plugin%20manifest%20validation.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Does Gemini CLI publish a JSON Schema for gemini-extension.json? None was found in the docs or the repository's config source.
imported_from: fact:plugins/manifest-validation@gemini-cli#scope-[null,null,null]
---

Imported from `facts/gemini-cli/plugins/manifest-validation.md`.

Open questions:
- Does Gemini CLI publish a JSON Schema for gemini-extension.json? None was found in the docs or the repository's config source.
