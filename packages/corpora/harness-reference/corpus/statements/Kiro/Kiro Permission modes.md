---
proposition:
  subject: "[Kiro](../../harnesses/Kiro.md)"
  predicate: permissions/modes
  object:
    supported: true
    modes:
      - name: trust-all-tools
        intent: bypass
        argv:
          - --trust-all-tools
        notes: any tool runs without confirmation, except what a deny rule blocks; /tools trust-all does the same in a session
      - name: approve-for-me
        intent: full-auto
        config_key: policies in the workspace permissions.yaml
        notes: chosen under /permissions in a CLI V3 session (CLI 2.36+); a classifier judges actions no rule settles
      - name: sandbox
        intent: sandbox
        argv:
          - --sandbox
        notes: requires the local command sandbox for a V3 headless run
      - name: Accept file changes
        intent: edits
        config_key: kiroAgent.agentAutonomy
        notes: IDE permission mode; file edits run without asking, commands still ask
    default_by_surface:
      interactive: actions outside the default allow rules prompt for approval
      headless: every ask is treated as a deny
    note: "The IDE has three per-chat modes: Supervised, Accept file changes and Approve for me. An ACP client can request policy presets (such as read-workspace or allow-all) in _meta.kiro.policyPreset."
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 kiro cli trust-all-tools flag](../../study-results/Kiro/2026-11-14%20kiro%20cli%20trust-all-tools%20flag.md)"
      - "[2026-11-14 kiro trust-all still honours deny rules](../../study-results/Kiro/2026-11-14%20kiro%20trust-all%20still%20honours%20deny%20rules.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: --trust-all-tools."
  - hasEvidenceItems:
      - "[2026-11-14 kiro approve for me in the CLI](../../study-results/Kiro/2026-11-14%20kiro%20approve%20for%20me%20in%20the%20CLI.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: approve for me in the CLI."
  - hasEvidenceItems:
      - "[2026-11-14 kiro cli sandbox flag](../../study-results/Kiro/2026-11-14%20kiro%20cli%20sandbox%20flag.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the sandbox flag."
  - hasEvidenceItems:
      - "[2026-11-14 kiro default prompts for approval](../../study-results/Kiro/2026-11-14%20kiro%20default%20prompts%20for%20approval.md)"
      - "[2026-11-14 kiro headless ask is deny](../../study-results/Kiro/2026-11-14%20kiro%20headless%20ask%20is%20deny.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the defaults."
  - hasEvidenceItems:
      - "[2026-11-14 kiro ide permission modes](../../study-results/Kiro/2026-11-14%20kiro%20ide%20permission%20modes.md)"
      - "[2026-11-14 kiro ide accept file changes](../../study-results/Kiro/2026-11-14%20kiro%20ide%20accept%20file%20changes.md)"
      - "[2026-11-14 kiro ide agent autonomy setting](../../study-results/Kiro/2026-11-14%20kiro%20ide%20agent%20autonomy%20setting.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the IDE modes."
  - hasEvidenceItems:
      - "[2026-11-14 kiro acp policy presets](../../study-results/Kiro/2026-11-14%20kiro%20acp%20policy%20presets.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: ACP policy presets."
reportedIn:
  - "[Kiro docs CLI commands](../../documents/kiro.dev/Kiro%20docs%20CLI%20commands.md)"
  - "[Kiro docs Permissions](../../documents/kiro.dev/Kiro%20docs%20Permissions.md)"
  - "[Kiro docs Permission modes](../../documents/kiro.dev/Kiro%20docs%20Permission%20modes.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Kiro](../../harnesses/Kiro.md)"
subject: "[Permission modes](../../subjects/permissions/Permission%20modes.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
