---
proposition:
  subject: '[Cargo](../../stores/Cargo.md)'
  predicate: project/build-dirs
  object:
    dirs:
    - path: target
      marker: Cargo.toml
      holds: build-output
      rebuild: rebuild
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Cargo build directories 1](../../study-results/Cargo/2026-11-21%20Cargo%20build%20directories%201.md)'
  - '[2026-11-21 Cargo build directories 2](../../study-results/Cargo/2026-11-21%20Cargo%20build%20directories%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The Cargo Book says build output goes to target/ in the workspace root by default and that
    cargo clean removes it; the Cargo.toml marker is Cargo's manifest file.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Cargo](../../stores/Cargo.md)'
subject: '[Build directories](../../subjects/project/Build%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The quoted pages do not themselves name Cargo.toml as the marker; it is Cargo's standard manifest.
---

The Cargo Book says build output goes to target/ in the workspace root by default and that cargo clean removes it; the Cargo.toml marker is Cargo's manifest file.
