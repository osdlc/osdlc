---
proposition:
  subject: '[Android SDK](../../stores/Android%20SDK.md)'
  predicate: location/override
  object:
    vars:
    - ANDROID_HOME
    - ANDROID_USER_HOME
    - ANDROID_EMULATOR_HOME
    - ANDROID_AVD_HOME
    settings: []
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Android SDK location overrides 1](../../study-results/Android%20SDK/2026-11-21%20Android%20SDK%20location%20overrides%201.md)'
  - '[2026-11-21 Android SDK location overrides 2](../../study-results/Android%20SDK/2026-11-21%20Android%20SDK%20location%20overrides%202.md)'
  - '[2026-11-21 Android SDK location overrides 3](../../study-results/Android%20SDK/2026-11-21%20Android%20SDK%20location%20overrides%203.md)'
  - '[2026-11-21 Android SDK location overrides 4](../../study-results/Android%20SDK/2026-11-21%20Android%20SDK%20location%20overrides%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: ANDROID_HOME moves the SDK (ANDROID_SDK_ROOT is deprecated); ANDROID_USER_HOME, ANDROID_EMULATOR_HOME
    and ANDROID_AVD_HOME move the user and AVD data.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Android SDK](../../stores/Android%20SDK.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

ANDROID_HOME moves the SDK (ANDROID_SDK_ROOT is deprecated); ANDROID_USER_HOME, ANDROID_EMULATOR_HOME and ANDROID_AVD_HOME move the user and AVD data.
