---
kind: source
reportedIn:
  - "[anomalyco opencode plugin host.ts at 32ece82](../../documents/github.com/anomalyco%20opencode%20plugin%20host.ts%20at%2032ece82.md)"
harness: "[OpenCode](../../harnesses/OpenCode.md)"
observed: 2026-11-05
locator: packages/plugin/src/host.ts:28-30, 60-63, 81-92 at 32ece823b820702961a7538ff02891f3791615c2
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-validation@opencode#observation-1
---

Imported from `facts/opencode/plugins/manifest-validation.md`, observation 1.

- unknown_fields: "ignored"
- invalid_fields: "a package.json that is not a JSON object counts as missing, and the directory falls back to root file names; a name that is not a string does the same; a GUI entry that is not .js or .cjs is not loaded"
