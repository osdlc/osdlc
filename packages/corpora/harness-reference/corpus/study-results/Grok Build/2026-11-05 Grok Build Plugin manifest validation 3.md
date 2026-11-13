---
kind: source
reportedIn:
  - "[xai-org grok-build plugin-marketplace index.rs](../../documents/github.com/xai-org%20grok-build%20plugin-marketplace%20index.rs.md)"
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
observed: 2026-11-05
locator: crates/codegen/xai-grok-plugin-marketplace/src/index.rs:14-64, 124-128, 190-217 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-validation@grok-build#observation-3
---

Imported from `facts/grok-build/plugins/manifest-validation.md`, observation 3.

- marketplace_unknown_fields: "ignored"
- marketplace_invalid_fields: "a file that exists but does not parse is an error; no fallback to the next candidate"

The index structs set no deny_unknown_fields, and unknown keys in a source object are skipped as IgnoredAny.
