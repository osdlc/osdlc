---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: cli/install
  object:
    supported: true
    methods:
      - kind: script
        argv:
          - sh
          - -c
          - curl -fsSL https://claude.ai/install.sh | bash
      - kind: brew
        argv:
          - brew
          - install
          - --cask
          - claude-code
        package: claude-code
      - kind: other
        argv:
          - winget
          - install
          - Anthropic.ClaudeCode
        package: Anthropic.ClaudeCode
        note: WinGet
      - kind: binary
        argv:
          - claude
          - install
          - "[target]"
        note: installs or reinstalls the native build from an existing claude
    update: native installations update in the background; `claude update` checks for updates and installs; package-manager installs update through the package manager
    uninstall: "native install: rm -f ~/.local/bin/claude and rm -rf ~/.local/share/claude"
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 help install](../../study-results/Claude%20Code/2026-11-09%20help%20install.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "`claude install` installs the native build."
  - hasEvidenceItems:
      - "[2026-11-09 help update](../../study-results/Claude%20Code/2026-11-09%20help%20update.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "`claude update` installs updates; package-manager installs update through the package manager."
  - hasEvidenceItems:
      - "[2026-11-09 docs setup native installer](../../study-results/Claude%20Code/2026-11-09%20docs%20setup%20native%20installer.md)"
      - "[2026-11-09 docs setup brew](../../study-results/Claude%20Code/2026-11-09%20docs%20setup%20brew.md)"
      - "[2026-11-09 docs setup winget](../../study-results/Claude%20Code/2026-11-09%20docs%20setup%20winget.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The setup page lists the install commands.
  - hasEvidenceItems:
      - "[2026-11-09 docs setup auto update](../../study-results/Claude%20Code/2026-11-09%20docs%20setup%20auto%20update.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Native installations update in the background.
  - hasEvidenceItems:
      - "[2026-11-09 docs setup uninstall](../../study-results/Claude%20Code/2026-11-09%20docs%20setup%20uninstall.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The setup page gives the native uninstall commands.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T07:53:54Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Install method](../../subjects/cli/Install%20method.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
