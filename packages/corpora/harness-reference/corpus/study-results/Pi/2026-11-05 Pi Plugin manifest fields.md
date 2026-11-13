---
kind: source
reportedIn:
  - "[earendil-works pi pi-manifest.ts at 2a32a60](../../documents/github.com/earendil-works%20pi%20pi-manifest.ts%20at%202a32a60.md)"
harness: "[Pi](../../harnesses/Pi.md)"
observed: 2026-11-05
locator: packages/coding-agent/src/core/pi-manifest.ts:4-42 at 2a32a605a9f18a5f0191f65358a2e764b2f69fc7
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-fields@pi#observation-1
---

Imported from `facts/pi/plugins/manifest-fields.md`, observation 1.

- file: "package.json"
- fields: [{"name":"pi.extensions","type":"string[]","required":false,"use":"extension entry files; globs and exclusions accepted; default extensions directory"},{"name":"pi.skills","type":"string[]","required":false,"use":"skill directories; globs and exclusions accepted; default skills directory"},{"name":"pi.prompts","type":"string[]","required":false,"use":"prompt template files; default prompts directory"},{"name":"pi.themes","type":"string[]","required":false,"use":"theme files; default themes directory"},{"name":"pi.changelogPath","type":"string","required":false,"use":"changelog shown after an update; default CHANGELOG.md; empty string disables it"}]
- note: "The pi block is optional: without it pi discovers the conventional directories. Only these five keys are read from it."
