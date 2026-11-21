---
proposition:
  subject: '[Android SDK](../../stores/Android%20SDK.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: sdkmanager --uninstall <package>
      removes: an installed SDK package such as a system image, platform or build-tools version
    - command: avdmanager delete avd -n <name>
      removes: an Android Virtual Device and its disk images
    - command: emulator -avd <name> -wipe-data
      removes: an AVD's user data, resetting it to factory state
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Android SDK clean command 1](../../study-results/Android%20SDK/2026-11-21%20Android%20SDK%20clean%20command%201.md)'
  - '[2026-11-21 Android SDK clean command 2](../../study-results/Android%20SDK/2026-11-21%20Android%20SDK%20clean%20command%202.md)'
  - '[2026-11-21 Android SDK clean command 3](../../study-results/Android%20SDK/2026-11-21%20Android%20SDK%20clean%20command%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: sdkmanager uninstalls SDK packages, avdmanager deletes AVDs, and -wipe-data resets an AVD's
    data partition.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Android SDK](../../stores/Android%20SDK.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

sdkmanager uninstalls SDK packages, avdmanager deletes AVDs, and -wipe-data resets an AVD's data partition.
