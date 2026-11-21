---
proposition:
  subject: '[Cabal](../../stores/Cabal.md)'
  predicate: project/build-dirs
  object:
    dirs:
    - path: dist-newstyle
      marker: cabal.project
      holds: build-output
      rebuild: rebuild
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Cabal build directories 1](../../study-results/Cabal/2026-11-21%20Cabal%20build%20directories%201.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The project file docs say build products go in dist-newstyle relative to the project root
    where cabal.project lives.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Cabal](../../stores/Cabal.md)'
subject: '[Build directories](../../subjects/project/Build%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- A project without cabal.project is marked by a *.cabal file instead; the docs read do not phrase that
  rule.
---

The project file docs say build products go in dist-newstyle relative to the project root where cabal.project lives.
