---
proposition:
  subject: '[Visual Studio Code](../../stores/Visual%20Studio%20Code.md)'
  predicate: location/override
  object:
    vars:
    - VSCODE_EXTENSIONS
    - VSCODE_APPDATA
    - XDG_CONFIG_HOME
    - VSCODE_PORTABLE
    settings:
    - --extensions-dir
    - --user-data-dir
    - --extensions-download-dir
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Visual Studio Code location overrides 1](../../study-results/Visual%20Studio%20Code/2026-11-21%20Visual%20Studio%20Code%20location%20overrides%201.md)'
  - '[2026-11-21 Visual Studio Code location overrides 2](../../study-results/Visual%20Studio%20Code/2026-11-21%20Visual%20Studio%20Code%20location%20overrides%202.md)'
  - '[2026-11-21 Visual Studio Code location overrides 3](../../study-results/Visual%20Studio%20Code/2026-11-21%20Visual%20Studio%20Code%20location%20overrides%203.md)'
  - '[2026-11-21 Visual Studio Code location overrides 4](../../study-results/Visual%20Studio%20Code/2026-11-21%20Visual%20Studio%20Code%20location%20overrides%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The docs name VSCODE_EXTENSIONS, --extensions-dir and --user-data-dir; userDataPath.ts
    adds VSCODE_APPDATA, XDG_CONFIG_HOME on Linux, and portable mode.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Visual Studio Code](../../stores/Visual%20Studio%20Code.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The docs name VSCODE_EXTENSIONS, --extensions-dir and --user-data-dir; userDataPath.ts adds VSCODE_APPDATA, XDG_CONFIG_HOME on Linux, and portable mode.
