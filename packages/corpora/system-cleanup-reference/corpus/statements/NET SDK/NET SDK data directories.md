---
proposition:
  subject: '[NET SDK](../../stores/NET%20SDK.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: macos
      path: ~/.dotnet
      holds: toolchains
      rebuild: re-download
    - platform: linux
      path: ~/.dotnet
      holds: toolchains
      rebuild: re-download
    - platform: windows
      path: '%LocalAppData%\Microsoft\dotnet'
      holds: toolchains
      rebuild: re-download
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 NET SDK data directories 1](../../study-results/NET%20SDK/2026-11-21%20NET%20SDK%20data%20directories%201.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The dotnet-install script reference gives its default install directory per platform; SDKs
    installed by system packages or the official installers live elsewhere and are not covered.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[NET SDK](../../stores/NET%20SDK.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No source here gives the default paths used by the official installers or Linux distribution packages
  (such as /usr/share/dotnet or /usr/local/share/dotnet).
---

The dotnet-install script reference gives its default install directory per platform; SDKs installed by system packages or the official installers live elsewhere and are not covered.
