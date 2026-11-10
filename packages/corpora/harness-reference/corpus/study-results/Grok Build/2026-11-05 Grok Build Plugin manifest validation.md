---
kind: source
reportedIn:
  - "[xai-org grok-build plugins manifest.rs](../../documents/github.com/xai-org%20grok-build%20plugins%20manifest.rs.md)"
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
observed: 2026-11-05
locator: crates/codegen/xai-grok-agent/src/plugins/manifest.rs:9, 117, 154-166, 274-295 and plugins/discovery.rs:605-657 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-validation@grok-build#observation-1
---

Imported from `facts/grok-build/plugins/manifest-validation.md`, observation 1.

- unknown_fields: "ignored"
- invalid_fields: "a parse error or an invalid name fails the manifest load; discovery skips the plugin with a warning"
