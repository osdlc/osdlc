---
kind: source
reportedIn:
  - "[earendil-works pi core source at 2a32a60](../../documents/github.com/earendil-works%20pi%20core%20source%20at%202a32a60.md)"
harness: "[Pi](../../harnesses/Pi.md)"
observed: 2026-11-05
locator: packages/coding-agent/src/core/pi-manifest.ts:18-42; packages/coding-agent/src/core/resource-loader.ts:75-100; packages/coding-agent/src/core/extensions/loader.ts:762-780 at 2a32a605a9f18a5f0191f65358a2e764b2f69fc7
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-validation@pi#observation-1
---

Imported from `facts/pi/plugins/manifest-validation.md`, observation 1.

- unknown_fields: "ignored"
- invalid_fields: "a pi resource key that is not an array of strings, or a changelogPath that is not a string, is ignored silently; unreadable or malformed JSON, or a pi value that is not an object, makes readPiManifest return no manifest; for extensions pi then falls back to index.ts or index.js"
- dependency_warning: "host-provided pi packages listed in dependencies draw an extension warning"
