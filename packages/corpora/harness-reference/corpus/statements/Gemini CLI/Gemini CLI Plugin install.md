---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: plugins/install
  object:
    commands:
      - gemini extensions install <source> [--ref <ref>] [--auto-update] [--pre-release] [--consent] [--skip-settings]
      - gemini extensions link <path>
    sources: a GitHub repository URL or a local path
    recorded_in: .gemini-extension-install.json in the installed extension's directory
    note: run from the terminal, not inside an interactive session; install copies the extension, link makes a symbolic link
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI extension install metadata file source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20extension%20install%20metadata%20file%20source.md)"
      - "[2026-11-14 Gemini CLI extension file names source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20extension%20file%20names%20source.md)"
      - "[2026-11-14 Gemini CLI extension install source positional source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20extension%20install%20source%20positional%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at 0.68.0: the install metadata file and the source argument."
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI extension install command docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20extension%20install%20command%20docs.md)"
      - "[2026-11-14 Gemini CLI extension install sources docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20extension%20install%20sources%20docs.md)"
      - "[2026-11-14 Gemini CLI extension management outside session docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20extension%20management%20outside%20session%20docs.md)"
      - "[2026-11-14 Gemini CLI extension link docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20extension%20link%20docs.md)"
      - "[2026-11-14 Gemini CLI extension install copy docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20extension%20install%20copy%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs at 0.68.0: the commands and what they do."
reportedIn:
  - "[google-gemini gemini-cli cli src config extension-manager.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20cli%20src%20config%20extension-manager.ts%20at%205a5c718.md)"
  - "[google-gemini gemini-cli cli src config extensions variables.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20cli%20src%20config%20extensions%20variables.ts%20at%205a5c718.md)"
  - "[google-gemini gemini-cli cli src commands extensions install.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20cli%20src%20commands%20extensions%20install.ts%20at%205a5c718.md)"
  - "[google-gemini gemini-cli docs extensions reference.md at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20docs%20extensions%20reference.md%20at%205a5c718.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Plugin install](../../subjects/plugins/Plugin%20install.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

An extension is installed with `gemini extensions install`, from a GitHub URL or a local path. The install metadata is written to `.gemini-extension-install.json` inside the installed copy.
