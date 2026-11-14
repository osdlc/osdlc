---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: plugins/manifest-fields
  object:
    file: package.json
    fields:
      - name: pi.extensions
        type: string[]
        required: false
        use: extension entry files; globs and exclusions accepted; default extensions directory
      - name: pi.skills
        type: string[]
        required: false
        use: skill directories; globs and exclusions accepted; default skills directory
      - name: pi.prompts
        type: string[]
        required: false
        use: prompt template files; default prompts directory
      - name: pi.themes
        type: string[]
        required: false
        use: theme files; default themes directory
      - name: pi.changelogPath
        type: string
        required: false
        use: changelog shown after an update; default CHANGELOG.md; empty string disables it
    note: "The pi block is optional: without it pi discovers the conventional directories. Only these five keys are read from it."
    docs_fields:
      - name: name
        type: string
        required: false
        use: package name; identifies an npm package
      - name: version
        type: string
        required: false
        use: matched against changelog headings; npm update checks
      - name: keywords
        type: string[]
        required: false
        use: the pi-package keyword lists an npm package in the pi.dev gallery
      - name: pi.image
        required: false
        use: gallery preview
      - name: pi.video
        required: false
        use: gallery preview
      - name: dependencies
        type: object
        required: false
        use: installed with an npm or git source; host-provided packages here draw a warning
      - name: peerDependencies
        type: object
        required: false
        use: host-provided pi packages, declared with a * range
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-05 Pi Plugin manifest fields](../../study-results/Pi/2026-11-05%20Pi%20Plugin%20manifest%20fields.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-05.
  - hasEvidenceItems:
      - "[2026-11-05 Pi Plugin manifest fields 2](../../study-results/Pi/2026-11-05%20Pi%20Plugin%20manifest%20fields%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-05.
reportedIn:
  - "[earendil-works pi pi-manifest.ts at 2a32a60](../../documents/github.com/earendil-works%20pi%20pi-manifest.ts%20at%202a32a60.md)"
  - "[pi docs Pi Packages at 2a32a60](../../documents/github.com/pi%20docs%20Pi%20Packages%20at%202a32a60.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
harness: "[Pi](../../harnesses/Pi.md)"
subject: "[Plugin manifest fields](../../subjects/plugins/Plugin%20manifest%20fields.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - What type do pi.image and pi.video take, and what reads them? The docs name them as gallery preview fields; the loader does not read them.
imported_from: fact:plugins/manifest-fields@pi#scope-[null,null,null]
---

Imported from `facts/pi/plugins/manifest-fields.md`.

Open questions:
- What type do pi.image and pi.video take, and what reads them? The docs name them as gallery preview fields; the loader does not read them.
