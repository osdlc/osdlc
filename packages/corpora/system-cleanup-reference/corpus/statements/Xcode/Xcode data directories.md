---
proposition:
  subject: '[Xcode](../../stores/Xcode.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: macos
      path: ~/Library/Developer/Xcode/DerivedData
      holds: build-output
      rebuild: rebuild
    - platform: macos
      path: ~/Library/Developer/Xcode/Archives
      holds: build-output
      rebuild: lost
    - platform: macos
      path: ~/Library/Developer/CoreSimulator/Devices
      holds: state
      rebuild: lost
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Xcode data directories 1](../../study-results/Xcode/2026-11-21%20Xcode%20data%20directories%201.md)'
  - '[2026-11-21 Xcode data directories 2](../../study-results/Xcode/2026-11-21%20Xcode%20data%20directories%202.md)'
  - '[2026-11-21 Xcode data directories 3](../../study-results/Xcode/2026-11-21%20Xcode%20data%20directories%203.md)'
  - '[2026-11-21 Xcode data directories 4](../../study-results/Xcode/2026-11-21%20Xcode%20data%20directories%204.md)'
  - '[2026-11-21 Xcode data directories 5](../../study-results/Xcode/2026-11-21%20Xcode%20data%20directories%205.md)'
  - '[2026-11-21 Xcode data directories 6](../../study-results/Xcode/2026-11-21%20Xcode%20data%20directories%206.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Apple's Xcode help gives the DerivedData and Archives defaults; the simulator device folder
    comes only from a third-party gist; Xcode 14+ runtimes live in an SIP-protected system location that
    cannot be deleted directly.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Xcode](../../stores/Xcode.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The device support folder (~/Library/Developer/Xcode/iOS DeviceSupport and siblings) is not described
  by any fetchable Apple page.
- No source gives the path of simulator runtime disk images; Apple says only that they are in a system-managed,
  SIP-protected location.
- Archives are treated as lost because they hold the exact shipped builds and their symbols; no source
  states this.
---

Apple's Xcode help gives the DerivedData and Archives defaults; the simulator device folder comes only from a third-party gist; Xcode 14+ runtimes live in an SIP-protected system location that cannot be deleted directly.
