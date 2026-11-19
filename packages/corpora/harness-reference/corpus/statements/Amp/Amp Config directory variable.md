---
proposition:
  subject: "[Amp](../../harnesses/Amp.md)"
  predicate: config/config-dir-env
  object:
    supported: partial
    var: XDG_CONFIG_HOME
    replaces: ~/.config
    sets:
      - plugins
    note: Documented only for the system plugins directory, $XDG_CONFIG_HOME/amp/plugins. The user settings file moves with the --settings-file <path> flag.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 XDG_CONFIG_HOME plugins directory](../../study-results/Amp/2026-11-14%20XDG_CONFIG_HOME%20plugins%20directory.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The plugins page says the variable moves the system plugins directory.
  - hasEvidenceItems:
      - "[2026-11-14 settings-file flag](../../study-results/Amp/2026-11-14%20settings-file%20flag.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The configuration page names a flag, not a variable, for the settings file.
reportedIn:
  - "[Amp docs Plugins](../../documents/ampcode.com/Amp%20docs%20Plugins.md)"
  - "[Amp docs Configuration](../../documents/ampcode.com/Amp%20docs%20Configuration.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Amp](../../harnesses/Amp.md)"
subject: "[Config directory variable](../../subjects/config/Config%20directory%20variable.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

