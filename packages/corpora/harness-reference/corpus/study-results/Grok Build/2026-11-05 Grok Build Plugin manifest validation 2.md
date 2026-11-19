---
kind: source
reportedIn:
  - "[xai-org grok-build plugin_cmd.rs](../../documents/github.com/xai-org%20grok-build%20plugin_cmd.rs.md)"
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
observed: 2026-11-05
locator: crates/codegen/xai-grok-pager/src/plugin_cmd.rs:135-136, 688-718 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-validation@grok-build#observation-2
---

Imported from `facts/grok-build/plugins/manifest-validation.md`, observation 2.

- validator: "grok plugin validate [<path>]"
- validator_checks: "loads the manifest from the search order and runs the same name check; prints name, version, description and a component summary"
