---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: plugins/session-load
  object:
    supported: false
    basis: omitted-from-help
    disable_via: -e/--extensions names the installed extensions to use for the session; `-e none` turns all of them off
    note: no flag loads an extension directory for one run; gemini extensions link <path> installs a symbolic link to a local directory
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI CLI option list source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20CLI%20option%20list%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "source at 0.68.0: the option list of the default command holds no option that loads an extension directory (absence)."
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI extensions option source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20extensions%20option%20source.md)"
      - "[2026-11-14 Gemini CLI extensions none override source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20extensions%20none%20override%20source.md)"
      - "[2026-11-14 Gemini CLI extensions flag none docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20extensions%20flag%20none%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "source and docs at 0.68.0: -e limits a session to the named installed extensions, and none disables all."
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI extension link docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20extension%20link%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs at 0.68.0: link installs a symbolic link to a development directory."
reportedIn:
  - "[google-gemini gemini-cli cli src config config.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20cli%20src%20config%20config.ts%20at%205a5c718.md)"
  - "[google-gemini gemini-cli cli src config extensions extensionEnablement.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20cli%20src%20config%20extensions%20extensionEnablement.ts%20at%205a5c718.md)"
  - "[google-gemini gemini-cli docs reference configuration.md at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20docs%20reference%20configuration.md%20at%205a5c718.md)"
  - "[google-gemini gemini-cli docs extensions reference.md at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20docs%20extensions%20reference.md%20at%205a5c718.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Session-only plugins](../../subjects/plugins/Session-only%20plugins.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

An extension must be installed or linked before a session can use it. For one session, `-e` picks which installed extensions are on. It names the ones to keep, so it has no per-extension off switch.
