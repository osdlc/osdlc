---
proposition:
  subject: '[Android SDK](../../stores/Android%20SDK.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: sdkmanager --list
      shows: installed and available SDK packages
    - command: avdmanager list avd
      shows: existing Android Virtual Devices
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Android SDK inventory command 1](../../study-results/Android%20SDK/2026-11-21%20Android%20SDK%20inventory%20command%201.md)'
  - '[2026-11-21 Android SDK inventory command 2](../../study-results/Android%20SDK/2026-11-21%20Android%20SDK%20inventory%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: sdkmanager --list and avdmanager list avd enumerate packages and AVDs; neither is documented
    as reporting sizes.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Android SDK](../../stores/Android%20SDK.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No SDK command is documented to report package or AVD sizes.
---

sdkmanager --list and avdmanager list avd enumerate packages and AVDs; neither is documented as reporting sizes.
