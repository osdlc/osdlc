---
proposition:
  subject: "[Kiro](../../harnesses/Kiro.md)"
  predicate: cli/binary
  object:
    supported: true
    name: kiro-cli
    version_argv:
      - --version
    path_hint: ~/.local/bin/kiro-cli
    subcommand: chat
    note: "`kiro` launches the IDE by default; the optional kiro-command-router integration can route `kiro` to the CLI. -V is the short form of --version."
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 kiro kiro-cli always launches the CLI](../../study-results/Kiro/2026-11-14%20kiro%20kiro-cli%20always%20launches%20the%20CLI.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: kiro-cli always launches the CLI."
  - hasEvidenceItems:
      - "[2026-11-14 kiro kiro command router](../../study-results/Kiro/2026-11-14%20kiro%20kiro%20command%20router.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: what the bare kiro command does."
  - hasEvidenceItems:
      - "[2026-11-14 kiro cli version argument](../../study-results/Kiro/2026-11-14%20kiro%20cli%20version%20argument.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the version argument."
  - hasEvidenceItems:
      - "[2026-11-14 kiro kiro-cli usual path](../../study-results/Kiro/2026-11-14%20kiro%20kiro-cli%20usual%20path.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the usual install path."
  - hasEvidenceItems:
      - "[2026-11-14 kiro chat is the default subcommand](../../study-results/Kiro/2026-11-14%20kiro%20chat%20is%20the%20default%20subcommand.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: chat is the default subcommand."
reportedIn:
  - "[Kiro docs CLI commands](../../documents/kiro.dev/Kiro%20docs%20CLI%20commands.md)"
  - "[Kiro docs CLI Agent Client Protocol](../../documents/kiro.dev/Kiro%20docs%20CLI%20Agent%20Client%20Protocol.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Kiro](../../harnesses/Kiro.md)"
subject: "[Executable name](../../subjects/cli/Executable%20name.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
