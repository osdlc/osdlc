---
kind: docs
reportedIn:
  - "[Claude Code docs Marketplace reference](../../documents/code.claude.com/Claude%20Code%20docs%20Marketplace%20reference.md)"
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
observed: 2026-11-05
locator: Marketplace file; Top-level fields; Validation messages
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-validation@claude-code#observation-2
---

Imported from `facts/claude-code/plugins/manifest-validation.md`, observation 2.

- marketplace_unknown_fields: "ignored"
- marketplace_invalid_entry: "each entry is validated on its own, so one invalid entry does not fail the marketplace"
- marketplace_validator: "claude plugin validate <marketplace root or marketplace.json>"

The validator warns `Unknown field 'x'. Claude Code ignores it at load time.` for unknown keys at the top level, under metadata, in an entry, or under an entry's relevance.
