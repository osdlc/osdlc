---
kind: docs
reportedIn:
  - "[Gemini CLI docs Extension reference at 3fd7d26](../../documents/github.com/Gemini%20CLI%20docs%20Extension%20reference%20at%203fd7d26.md)"
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
observed: 2026-11-05
locator: docs/extensions/reference.md:109-176 at 3fd7d263466b9e5d30b2da1ebf85dae956a0fb86
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-fields@gemini-cli#observation-2
---

Imported from `facts/gemini-cli/plugins/manifest-fields.md`, observation 2.

- docs_fields: [{"name":"description","type":"string","required":false,"use":"shown on geminicli.com/extensions"}]

The docs list description; the CLI's ExtensionConfig type does not declare it, so the CLI itself does not read it.
