---
proposition:
  subject: '[CocoaPods](../../stores/CocoaPods.md)'
  predicate: project/build-dirs
  object:
    dirs:
    - path: Pods
      marker: Podfile
      holds: packages
      rebuild: re-download
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 CocoaPods build directories 1](../../study-results/CocoaPods/2026-11-21%20CocoaPods%20build%20directories%201.md)'
  - '[2026-11-21 CocoaPods build directories 2](../../study-results/CocoaPods/2026-11-21%20CocoaPods%20build%20directories%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The configuration source puts the sandbox (Pods) in the installation root, the directory
    holding the Podfile.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[CocoaPods](../../stores/CocoaPods.md)'
subject: '[Build directories](../../subjects/project/Build%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- Some teams commit Pods to source control; no source covers how a cleaner should detect that.
---

The configuration source puts the sandbox (Pods) in the installation root, the directory holding the Podfile.
