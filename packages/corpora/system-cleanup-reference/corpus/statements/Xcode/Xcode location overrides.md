---
proposition:
  subject: '[Xcode](../../stores/Xcode.md)'
  predicate: location/override
  object:
    vars: []
    settings:
    - 'Xcode > Settings > Locations: Derived Data'
    - 'Xcode > Settings > Locations: Archives'
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Xcode location overrides 1](../../study-results/Xcode/2026-11-21%20Xcode%20location%20overrides%201.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The Locations pane moves derived data (Default, Relative or Custom) and archives.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Xcode](../../stores/Xcode.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- Command-line overrides (such as xcodebuild -derivedDataPath) are not covered by the quoted source.
---

The Locations pane moves derived data (Default, Relative or Custom) and archives.
