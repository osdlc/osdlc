---
proposition:
  subject: "[Amp](../../harnesses/Amp.md)"
  predicate: plugins/install
  object:
    commands:
      - amp plugins add <url>
      - amp plugins add <url> --target workspace
      - amp plugins add @amp/oracle
    sources: a single-file plugin from a URL, or a shared plugin by name
    recorded_in: the system plugins directory by default; .amp/plugins with --target workspace
    note: The command installs on the current machine only. A hosted personal or workspace import is made by asking Amp in a thread.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 plugins add single-file from URL](../../study-results/Amp/2026-11-14%20plugins%20add%20single-file%20from%20URL.md)"
      - "[2026-11-14 plugins add target workspace](../../study-results/Amp/2026-11-14%20plugins%20add%20target%20workspace.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The plugins page gives the command and its target option.
  - hasEvidenceItems:
      - "[2026-11-14 plugins add installs a system plugin](../../study-results/Amp/2026-11-14%20plugins%20add%20installs%20a%20system%20plugin.md)"
      - "[2026-11-14 plugins add by name](../../study-results/Amp/2026-11-14%20plugins%20add%20by%20name.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The global plugins page says where the command installs and shows install by name.
reportedIn:
  - "[Amp docs Plugins](../../documents/ampcode.com/Amp%20docs%20Plugins.md)"
  - "[Amp docs Global Plugins & Skills](../../documents/ampcode.com/Amp%20docs%20Global%20Plugins%20&%20Skills.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Amp](../../harnesses/Amp.md)"
subject: "[Plugin install](../../subjects/plugins/Plugin%20install.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

