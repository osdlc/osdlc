---
proposition:
  subject: '[Android Studio](../../stores/Android%20Studio.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: linux
      path: ~/.cache/Google/AndroidStudio<VERSION>
      holds: cache
      rebuild: rebuild
    - platform: linux
      path: ~/.cache/Google/AndroidStudio<VERSION>/log
      holds: logs
      rebuild: lost
    - platform: linux
      path: ~/.local/share/Google/AndroidStudio<VERSION>
      holds: packages
      rebuild: re-download
    - platform: macos
      path: ~/Library/Caches/Google/AndroidStudio<VERSION>
      holds: cache
      rebuild: rebuild
    - platform: macos
      path: ~/Library/Logs/Google/AndroidStudio<VERSION>
      holds: logs
      rebuild: lost
    - platform: macos
      path: ~/Library/Application Support/Google/AndroidStudio<VERSION>/plugins
      holds: packages
      rebuild: re-download
    - platform: windows
      path: '%LOCALAPPDATA%\Google\AndroidStudio<VERSION>'
      holds: cache
      rebuild: rebuild
    - platform: windows
      path: '%LOCALAPPDATA%\Google\AndroidStudio<VERSION>\log'
      holds: logs
      rebuild: lost
    - platform: windows
      path: '%APPDATA%\Google\AndroidStudio<VERSION>\plugins'
      holds: packages
      rebuild: re-download
    - platform: windows
      path: '%USERPROFILE%\.gradle'
      holds: cache
      rebuild: re-download
    - platform: windows
      path: '%USERPROFILE%\AppData\Local\Android\SDK'
      holds: toolchains
      rebuild: re-download
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Android Studio data directories 1](../../study-results/Android%20Studio/2026-11-21%20Android%20Studio%20data%20directories%201.md)'
  - '[2026-11-21 Android Studio data directories 2](../../study-results/Android%20Studio/2026-11-21%20Android%20Studio%20data%20directories%202.md)'
  - '[2026-11-21 Android Studio data directories 3](../../study-results/Android%20Studio/2026-11-21%20Android%20Studio%20data%20directories%203.md)'
  - '[2026-11-21 Android Studio data directories 4](../../study-results/Android%20Studio/2026-11-21%20Android%20Studio%20data%20directories%204.md)'
  - '[2026-11-21 Android Studio data directories 5](../../study-results/Android%20Studio/2026-11-21%20Android%20Studio%20data%20directories%205.md)'
  - '[2026-11-21 Android Studio data directories 6](../../study-results/Android%20Studio/2026-11-21%20Android%20Studio%20data%20directories%206.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The troubleshooting page lists the system (idea.system.path), plugins and log directories
    per platform; the configuration page lists the Gradle cache and SDK defaults on Windows. AndroidStudio
    becomes AndroidStudioPreview for RC and Canary builds.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Android Studio](../../stores/Android%20Studio.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The Gradle cache and SDK defaults are quoted only for Windows here; the Linux and macOS defaults belong
  to the Gradle and Android SDK records.
- The plugins directory on Linux is given as the whole ~/.local/share/Google/AndroidStudio<VERSION> directory,
  not a plugins subfolder.
---

The troubleshooting page lists the system (idea.system.path), plugins and log directories per platform; the configuration page lists the Gradle cache and SDK defaults on Windows. AndroidStudio becomes AndroidStudioPreview for RC and Canary builds.
