---
proposition:
  subject: '[Visual Studio](../../stores/Visual%20Studio.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: '"%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vs_installer.exe" --nocache'
      removes: cached installer packages for the product being installed, modified or repaired
    - command: setup.exe modifySettings --installPath <path> --removeOos true
      removes: installed components that have moved to an out-of-support state
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Visual Studio clean command 1](../../study-results/Visual%20Studio/2026-11-21%20Visual%20Studio%20clean%20command%201.md)'
  - '[2026-11-21 Visual Studio clean command 2](../../study-results/Visual%20Studio/2026-11-21%20Visual%20Studio%20clean%20command%202.md)'
  - '[2026-11-21 Visual Studio clean command 3](../../study-results/Visual%20Studio/2026-11-21%20Visual%20Studio%20clean%20command%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Microsoft Learn documents --nocache as deleting existing packages and --removeOos as removing
    out-of-support components; neither cleans ComponentModelCache or .vs, which the docs only say to delete
    by hand.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Visual Studio](../../stores/Visual%20Studio.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform:
  - windows
status: current
---

Microsoft Learn documents --nocache as deleting existing packages and --removeOos as removing out-of-support components; neither cleans ComponentModelCache or .vs, which the docs only say to delete by hand.
