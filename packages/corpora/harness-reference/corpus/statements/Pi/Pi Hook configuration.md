---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: hooks/config
  object:
    kind: TypeScript extensions
    shell_hooks: false
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-08-08 Pi Hook configuration](../../study-results/Pi/2026-08-08%20Pi%20Hook%20configuration.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: weak
    description: third-party observed 2026-08-08.
  - hasEvidenceItems:
      - "[2026-11-14 Pi docs extensions are TypeScript modules](../../study-results/Pi/2026-11-14%20Pi%20docs%20extensions%20are%20TypeScript%20modules.md)"
      - "[2026-11-14 Pi docs extension events](../../study-results/Pi/2026-11-14%20Pi%20docs%20extension%20events.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The extensions docs at v1.5.2 say extensions are TypeScript modules that subscribe to lifecycle events with pi.on(). The page documents no shell hook file; that part of the value rests on the omission.
  - hasEvidenceItems:
      - "[2026-11-14 Pi extension events source](../../study-results/Pi/2026-11-14%20Pi%20extension%20events%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The ExtensionAPI type at v1.5.2 declares the on(event, handler) overloads that extensions use, such as tool_call and tool_result.
reportedIn:
  - "[Harness comparison](../../documents/skillwright/Harness%20comparison.md)"
  - "[Pi docs Extensions at v1.5.2](../../documents/github.com/Pi%20docs%20Extensions%20at%20v1.5.2.md)"
  - "[Pi source extensions types.ts at v1.5.2](../../documents/github.com/Pi%20source%20extensions%20types.ts%20at%20v1.5.2.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-08-08T00:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-14T18:00:00Z
harness: "[Pi](../../harnesses/Pi.md)"
subject: "[Hook configuration](../../subjects/hooks/Hook%20configuration.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:hooks/config@pi#scope-[null,null,null]
---

Imported from `facts/pi/hooks/config.md`.

Checked against the extensions docs and the ExtensionAPI type at v1.5.2 on 2026-11-14: hooks are TypeScript extension handlers. The strength is kept at moderate because `shell_hooks: false` rests on the docs not describing a shell hook file.
