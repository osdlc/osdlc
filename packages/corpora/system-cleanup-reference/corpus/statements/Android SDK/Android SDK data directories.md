---
proposition:
  subject: '[Android SDK](../../stores/Android%20SDK.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: macos
      path: ~/Library/Android/sdk/system-images
      holds: images
      rebuild: re-download
    - platform: macos
      path: ~/Library/Android/sdk
      holds: toolchains
      rebuild: re-download
    - platform: all
      path: ~/.android/avd
      holds: images
      rebuild: lost
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Android SDK data directories 1](../../study-results/Android%20SDK/2026-11-21%20Android%20SDK%20data%20directories%201.md)'
  - '[2026-11-21 Android SDK data directories 2](../../study-results/Android%20SDK/2026-11-21%20Android%20SDK%20data%20directories%202.md)'
  - '[2026-11-21 Android SDK data directories 3](../../study-results/Android%20SDK/2026-11-21%20Android%20SDK%20data%20directories%203.md)'
  - '[2026-11-21 Android SDK data directories 4](../../study-results/Android%20SDK/2026-11-21%20Android%20SDK%20data%20directories%204.md)'
  - '[2026-11-21 Android SDK data directories 5](../../study-results/Android%20SDK/2026-11-21%20Android%20SDK%20data%20directories%205.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Android docs place system images under the SDK's system-images directory (macOS example
    ~/Library/Android/sdk) and AVD data, mostly large disk images with app state, under ~/.android/avd.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Android SDK](../../stores/Android%20SDK.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- 'The Linux and Windows default SDK locations are not settled: the emulator page says ~/Library/Android/sdk
  for ''macOS and Linux'', which does not match Android Studio''s usual Linux default (~/Android/Sdk);
  no fetched source gives the Windows SDK default.'
- Android Studio/AGP build caches outside Gradle's are not covered.
---

Android docs place system images under the SDK's system-images directory (macOS example ~/Library/Android/sdk) and AVD data, mostly large disk images with app state, under ~/.android/avd.
