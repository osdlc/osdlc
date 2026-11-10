---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: plugins/manifest-fields
  object:
    file: package.json
    fields:
      - name: name
        type: string
        required: conditional
        use: package name; resolves exports for a local directory, and is the id of a plugin with no server part
        note: A local directory is resolved through package.json only when both name and exports are set; otherwise OpenCode uses root file names.
      - name: exports
        type: object
        required: conditional
        use: maps the plugin parts to files
        note: See name.
      - name: exports["."]
        type: string
        required: false
        use: server part, also read as exports["./server"]
      - name: exports["./server"]
        type: string
        required: false
        use: server part; tried before "."
      - name: exports["./tui"]
        type: string
        required: false
        use: terminal UI part
      - name: exports["./rpc"]
        type: string
        required: false
        use: typed RPC contract the other parts call
      - name: exports["./gui-experimental"]
        type: string
        required: false
        use: prebuilt CommonJS bundle for OpenCode Desktop; must end in .js or .cjs
    fallback_files: server (else index), tui, rpc with .ts, .tsx or .js; gui-experimental.cjs or gui-experimental.js
    plugin_id: set by Plugin.define in the server part, not by the manifest
    docs_fields:
      - name: version
        type: string
        required: false
        use: not documented; shown in the example package.json
      - name: type
        type: string
        required: false
        use: not documented; module in the example
      - name: files
        type: string[]
        required: false
        use: must include the built GUI bundle when publishing
      - name: dependencies
        type: object
        required: false
        use: carries the @opencode/plugin SDK
    published_docs_manifest: none
    published_docs_note: the published plugins page describes a plugin as a JavaScript or TypeScript module listed under the plugin key, with no manifest file
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-05 OpenCode Plugin manifest fields](../../study-results/OpenCode/2026-11-05%20OpenCode%20Plugin%20manifest%20fields.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-05.
  - hasEvidenceItems:
      - "[2026-11-05 OpenCode Plugin manifest fields 2](../../study-results/OpenCode/2026-11-05%20OpenCode%20Plugin%20manifest%20fields%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-05.
  - hasEvidenceItems:
      - "[2026-11-05 OpenCode Plugin manifest fields 3](../../study-results/OpenCode/2026-11-05%20OpenCode%20Plugin%20manifest%20fields%203.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-05.
reportedIn:
  - "[anomalyco opencode plugin host.ts at 32ece82](../../documents/github.com/anomalyco%20opencode%20plugin%20host.ts%20at%2032ece82.md)"
  - "[OpenCode docs source Build plugins overview at 32ece82](../../documents/github.com/OpenCode%20docs%20source%20Build%20plugins%20overview%20at%2032ece82.md)"
  - "[OpenCode docs source for opencode.ai docs plugins at 32ece82](../../documents/github.com/OpenCode%20docs%20source%20for%20opencode.ai%20docs%20plugins%20at%2032ece82.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Plugin manifest fields](../../subjects/plugins/Plugin%20manifest%20fields.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:plugins/manifest-fields@opencode#scope-[null,null,null]
---

Imported from `facts/opencode/plugins/manifest-fields.md`.
