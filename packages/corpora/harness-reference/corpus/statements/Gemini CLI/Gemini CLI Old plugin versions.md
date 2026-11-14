---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: plugins/upgrade-retention
  object:
    old_version_kept: false
    mechanism: an update removes the installed extension's directory, then copies the new source into the same directory
    update: gemini extensions update <name>, or --all
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI extension update removes old copy source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20extension%20update%20removes%20old%20copy%20source.md)"
      - "[2026-11-14 Gemini CLI extension uninstall removes directory source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20extension%20uninstall%20removes%20directory%20source.md)"
      - "[2026-11-14 Gemini CLI extension update keeps no backup source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20extension%20update%20keeps%20no%20backup%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at 0.68.0: an update uninstalls the previous copy, which removes its directory, and a TODO notes that no backup is made."
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI extension install copy docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20extension%20install%20copy%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs at 0.68.0: the install is a copy, refreshed by gemini extensions update."
reportedIn:
  - "[google-gemini gemini-cli cli src config extension-manager.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20cli%20src%20config%20extension-manager.ts%20at%205a5c718.md)"
  - "[google-gemini gemini-cli docs extensions reference.md at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20docs%20extensions%20reference.md%20at%205a5c718.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Old plugin versions](../../subjects/plugins/Old%20plugin%20versions.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[Gemini CLI Old plugin versions open](Gemini%20CLI%20Old%20plugin%20versions%20open.md)"
---

An update calls `uninstallExtension` for the installed copy, which removes its directory, and then copies the new files to the same path. The previous version does not stay on disk.
