---
kind: docs
reportedIn:
  - "[Claude Code docs Plugin manifest reference](../../documents/code.claude.com/Claude%20Code%20docs%20Plugin%20manifest%20reference.md)"
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
observed: 2026-11-05
locator: Unrecognized fields; Validate the manifest
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-validation@claude-code#observation-1
---

Imported from `facts/claude-code/plugins/manifest-validation.md`, observation 1.

- unknown_fields: "ignored"
- strict_objects: "an unknown key inside a userConfig option, channels entry, lspServers config or monitors entry is an error; the plugin does not load"
- invalid_fields: "a type mismatch or a missing or escaping path fails validation; Claude Code reports the same problem when it loads the plugin"
- validator: "claude plugin validate <dir> (--strict turns warnings into failures)"
- validator_warns_on: "unknown top-level field, non-kebab-case name, missing version, description or author"

An unknown top-level key in plugin.json is stripped and the plugin loads; the validator reports it as a warning.
